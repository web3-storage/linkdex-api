import { S3Client, GetObjectCommand, HeadObjectCommand, paginateListObjectsV2, _Object } from "@aws-sdk/client-s3"
import { CarBlockIterator } from '@ipld/car'
import { LinkIndexer } from 'linkdex'
import { HashingLinkIndexer } from 'linkdex/hashing-indexer'
import pRetry from 'p-retry'

export async function indexCar (bucket: string, s3: S3Client, index: LinkIndexer | HashingLinkIndexer, carKey: string) {
  const carStream = await getObjectStream(carKey, bucket, s3)
  const carBlocks = await CarBlockIterator.fromIterable(carStream)
  for await (const block of carBlocks) {
    const result = index.decodeAndIndex(block)
    if (result instanceof Promise) {
      await result
    }
  }
}

export async function keyExists (key: string, bucket: string, s3: S3Client) {
  try {
    const res = await s3.send(new HeadObjectCommand({ Key: key, Bucket: bucket }))
    return true
  } catch {
    return false
  }
}

// could return sizes as well here, and use them to batch how many cars to process at once.
export async function listSiblings (key: string, bucket: string, s3: S3Client): Promise<string[]> {
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

export async function listCars (prefix: string, bucket: string, s3: S3Client): Promise<_Object[]> {
  const files = []
  for await (const data of paginateListObjectsV2({ client: s3 }, { Bucket: bucket, Prefix: prefix })) {
    const batch = data.Contents ?? []
    for (const item of batch) {
      if (item.Key !== undefined && item.Key.endsWith('.car')) {
        files.push(item)
      }
    }
  }
  return files
}

export async function getObjectStream (key: string, bucket: string, s3: S3Client) {
  const res = await pRetry(() => s3.send(new GetObjectCommand({
    Key: key,
    Bucket: bucket,
  })), { retries: 5 })
  return res.Body
}