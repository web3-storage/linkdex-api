import { APIGatewayProxyHandlerV2 } from "aws-lambda"
import { S3Client } from "@aws-sdk/client-s3"
import { LinkIndexer } from 'linkdex'
import pMap from 'p-map'
import { keyExists, listSiblings, indexCar } from './lib/s3.js'
import { response } from './lib/api.js'

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
