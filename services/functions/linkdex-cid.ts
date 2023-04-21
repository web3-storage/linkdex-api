import { APIGatewayProxyHandlerV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { S3Client, _Object } from "@aws-sdk/client-s3"
import { CID } from 'multiformats/cid'
import { DagStructure, LinkIndexer } from 'linkdex'
import pMap from 'p-map'
import { listCars, indexCar } from './lib/s3.js'
import { response } from './lib/api.js'

/** A linkdex reporter takes an input CID, and produces a linkdex report. */
export interface Reporter {
  report (cid: CID): Promise<Report>
}

export interface Report {
  /** Bucket+key of CAR files where the DAG may be found. */
  cars: string[]
  /** The structural completeness of the DAG within the specified CARs. */
  structure: DagStructure
  /** How many blocks were indexed. */
  blocksIndexed: number
  /** How many unique CIDs were seen. */
  uniqueCids: number
  /** How many blocks/CIDs failed to decode. */
  undecodeable: number
}

const nullReport: Report = { cars: [], structure: 'Unknown', blocksIndexed: 0, uniqueCids: 0, undecodeable: 0 }

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const cid = event.pathParameters?.cid ?? ''
  const bucket = process.env.BUCKET_NAME ?? ''
  const s3 = new S3Client({})
  const reporters = [new CompleteReporter(bucket, s3), new RawReporter(bucket, s3)]
  try {
    return await getLinkdexReportForCid(cid, reporters)
  } catch (err: any) {
    const details = err?.message ?? err
    return response({ error: { details }}, { statusCode: 500 })
  }
}

/**
 * A linkdex reporter that indexes and reports on CARs found in the `raw`
 * directory of a bucket.
 * 
 * For dotStorage CARs are grouped by userid with keys like `raw/<cid>/<userid>/<hash>.car`.
 * We find all the CARs for a given cid by prefix, group them by userid, 
 * and then sort by count of CARs, under the assumptions that the upload with the most CARs
 * is likely to contain the full DAG.
 */
export class RawReporter implements Reporter {
  constructor (private bucket: string, private s3: S3Client) {}

  async report (cid: CID): Promise<Report> {
    const prefix = `raw/${cid}/`
    const carObjects = await listCars(prefix, this.bucket, this.s3)
    if (carObjects.length === 0) {
      return nullReport
    }
    const carGroups = groupByPrefixSortByObjectCount(carObjects)
    const reports: Report[] = []
    for (const carKeys of carGroups) {
      // create a per user id prefix index. 
      // avoid using a shared indexer across all here. 
      // if any user uploaded a CAR with extraneous blocks with links a global index would always return 'Partial'
      const index = new LinkIndexer()
      const indexer = indexCar.bind(null, this.bucket, this.s3, index)
      await pMap(carKeys, indexer, { concurrency: 10 })
      const cars = carKeys.map(k => `${this.bucket}/${k}`)
      if (index.getDagStructureLabel() === 'Complete') {
        // return as soon as we find a set of CARs that has a complete DAG
        return { cars, ...index.report(), structure: 'Complete' }
      }
      reports.push({ cars, ...index.report(), structure: index.getDagStructureLabel() })
    }
    return reports.find(r => r.structure === 'Partial') ?? reports.find(r => r.structure === 'Unknown') ?? nullReport
  }
}

/**
 * A linkdex reporter that indexes and reports on CARs found in the `complete`
 * directory of a bucket.
 *
 * Complete CARs are expected to be found at `complete/<root>.car`, where
 * "root" is the root CID (base32, V1) of the DAG that it contains.
 * 
 * CARs in this directory _should_ by definition contain a complete DAG, but we
 * run linkdex over them anyway to verify.
 */
export class CompleteReporter implements Reporter {
  constructor (private bucket: string, private s3: S3Client) {}

  async report (cid: CID): Promise<Report> {
    const key = `complete/${cid.toV1()}.car`
    const index = new LinkIndexer()
    await indexCar(this.bucket, this.s3, index, key)
    return { cars: [`${this.bucket}/${key}`], ...index.report(), structure: index.getDagStructureLabel() }
  }
}

/**
 * Try and find a set of CARs that contain a complete DAG for a given CID.
 *
 * Passed reporters are queried in order until a report with structure
 * "Complete" is encountered. If no "Complete" report is found, a report with
 * structure "Partial" is perfered over "Unknown".
 *
 * @param reporters Reporters that are capable of generating a linkdex report 
 * for a given CID.
 */
export async function getLinkdexReportForCid (cid: string, reporters: Reporter[]) {
  if (!cid) {
    return response({ error: { details: 'cid path param is required' }}, { statusCode: 400 })
  }
  if (!CID.parse(cid)) {
    return response({ error: { details: 'cid is invalid' }}, { statusCode: 400 })
  }
  const reports: Report[] = []
  for (const r of reporters) {
    try {
      const report = await r.report(CID.parse(cid))
      if (report.structure === 'Complete') {
        return response(report)
      }
      reports.push(report)
    } catch (err) {
      console.error(err)
    }
  }
  return response(reports.find(r => r.structure === 'Partial') ?? reports.find(r => r.structure === 'Unknown') ?? nullReport)
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
