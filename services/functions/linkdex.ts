import { APIGatewayProxyHandlerV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { S3Client, GetObjectCommand, HeadObjectCommand, paginateListObjectsV2 } from "@aws-sdk/client-s3"
import { CarBlockIterator } from '@ipld/car'
import { LinkIndexer } from 'linkdex'
import pRetry from 'p-retry'
import pMap from 'p-map'

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const key = event.queryStringParameters?.key ?? ''
  const bucket = process.env.BUCKET_NAME ?? ''
  try {
    return await getLinkdexReport(key, bucket, new S3Client({}))
  } catch (err: any) {
    const details = err?.message ?? err
    return response({ error: { details }}, { statusCode: 500 })
  }
}

export async function getLinkdexReport (key: string, bucket: string, s3: S3Client) {
  if (!key) {
    return response({ error: { details: 'key query param is required' }}, { statusCode: 400 })
  }
  if (!key.startsWith('raw/') || !key.endsWith('.car') || key.split('/').length !== 4) {
    return response({ error: { details: 'key is forbidden' }}, { statusCode: 403 })
  }
  if (!keyExists(key, bucket, s3)) {
    return response({ error: { details: 'key is forbidden' }}, { statusCode: 403 })
  }
  const carKeys = await listSiblings(key, bucket, s3)
  const index = new LinkIndexer()
  const indexer = indexCar.bind(null, bucket, s3, index)
  await pMap(carKeys, indexer, { concurrency: 10 })
  return response({
    cars: carKeys,
    ...index.report()
  })
}

async function indexCar (bucket: string, s3: S3Client, index: LinkIndexer, carKey: string) {
  const carStream = await getObjectStream(carKey, bucket, s3)
  const carBlocks = await CarBlockIterator.fromIterable(carStream)
  for await (const block of carBlocks) {
    index.decodeAndIndex(block)
  }
}

async function keyExists (key: string, bucket: string, s3: S3Client) {
  try {
    const res = await s3.send(new HeadObjectCommand({ Key: key, Bucket: bucket }))
    return true
  } catch {
    return false
  }
}

// could return sizes as well here, and use them to batch how many cars to process at once.
async function listSiblings (key: string, bucket: string, s3: S3Client): Promise<string[]> {
  const prefix = key.substring(0, key.lastIndexOf('/'))
  const files = []
  for await (const data of paginateListObjectsV2({ client: s3 }, { Bucket: bucket, Prefix: prefix })) {
    const batch = data.Contents ?? []
    for (const item of batch) {
      if (item.Key !== undefined && item.Key.endsWith('.car')) {
        files.push(item.Key)
      }
    }
  }
  return files
}

async function getObjectStream (key: string, bucket: string, s3: S3Client) {
  const res = await pRetry(() => s3.send(new GetObjectCommand({
    Key: key,
    Bucket: bucket,
  })), { retries: 5 })
  return res.Body
}

function response (body: any, opts: APIGatewayProxyStructuredResultV2 = {}): APIGatewayProxyStructuredResultV2 {
  return {
    ...opts,
    statusCode: opts.statusCode ?? 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers),
    body: JSON.stringify(body)
  }
}
