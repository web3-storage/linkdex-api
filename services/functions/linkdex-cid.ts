import { APIGatewayProxyHandlerV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { S3Client, _Object } from "@aws-sdk/client-s3"
import { CID } from 'multiformats/cid'
import { DagStructure, LinkIndexer } from 'linkdex'
import pMap from 'p-map'
import { listCars, indexCar } from './lib/s3.js'
import { response } from './lib/api.js'

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const cid = event.pathParameters?.cid ?? ''
  const bucket = process.env.BUCKET_NAME ?? ''
  try {
    return await getLinkdexReportForCid(cid, bucket, new S3Client({}))
  } catch (err: any) {
    const details = err?.message ?? err
    return response({ error: { details }}, { statusCode: 500 })
  }
}

/**
 * Try and find a set of CARs that contain a complete DAG for a given CID.
 * For dotStorage CARs are grouped by userid with keys like `raw/<cid>/<userid>/<hash>.car`.
 * We find all the CARs for a given cid by prefix, group them by userid, 
 * and then sort by count of CARs, under the assumptions that the upload with the most CARs
 * is likely to contain the full DAG.
 */
export async function getLinkdexReportForCid (cid: string, bucket: string, s3: S3Client) {
  if (!cid) {
    return response({ error: { details: 'cid path param is required' }}, { statusCode: 400 })
  }
  if (!CID.parse(cid)) {
    return response({ error: { details: 'cid is invalid' }}, { statusCode: 400 })
  }
  const prefix = `raw/${cid}/`
  const carObjects = await listCars(prefix, bucket, s3)
  if (carObjects.length === 0) {
    return response({ error: { details: 'cid not found' }}, { statusCode: 404 })
  }
  const carGroups = groupByPrefixSortByObjectCount(carObjects)
  const indexes: LinkIndexer[] = []
  for (const carKeys of carGroups) {
    // create a per user id prefix index. 
    // avoid using a shared indexer across all here. 
    // if any user uploaded a CAR with extraneous blocks with links a global index would always return 'Partial'
    const index = new LinkIndexer()
    const indexer = indexCar.bind(null, bucket, s3, index)
    await pMap(carKeys, indexer, { concurrency: 10 })
    if (index.getDagStructureLabel() === 'Complete') {
      // return as soon as we find a set of CARs that has a complete DAG
      return response({ structure: 'Complete' })
    }
    indexes.push(index)
  }
  const structure: DagStructure = indexes.some(i => i.getDagStructureLabel() === 'Partial') ? 'Partial' : 'Unknown'
  return response({ structure })
}

export function groupByPrefixSortByObjectCount (carObjects: _Object[]): string[][] {
  const pathMap: Map<string, string[]> = new Map()
  for (const obj of carObjects) {
    if (!obj.Key) continue
    // e.g. "raw/bafy/1234/"
    const prefix = obj.Key.substring(0, obj.Key.lastIndexOf('/') + 1)
    const keys = pathMap.get(prefix) || []
    keys.push(obj.Key)
    pathMap.set(prefix, keys)
  }
  const groups = Array.from(pathMap.values())
  groups.sort((a, b) => b.length - a.length)
  return groups
}
