import { S3Event, SNSEvent, SNSHandler } from 'aws-lambda'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { DynamoDBClient, BatchWriteItemCommand, BatchWriteItemCommandInput } from '@aws-sdk/client-dynamodb'
import { CarBlockIterator } from '@ipld/car'
import pRetry from 'p-retry'
import { LinkIndexer } from 'linkdex'
import * as raw from 'multiformats/codecs/raw'

const MAX_RETRIES = process.env.MAX_RETRIES ? parseInt(process.env.MAX_RETRIES) : 5
const DYNAMO_TABLE = process.env.DYNAMO_TABLE || 'linkdex'

export const handler: SNSHandler = async (event) => {
  const records = toS3Event(event).Records
    .filter(r => r.eventName.startsWith('ObjectCreated'))
    .filter(r => r.s3.object.key.endsWith('.car'))

  const db = new DynamoDBClient({})
  
  for (const r of records) {
    const s3 = new S3Client({ region: r.awsRegion })

    const getCmd = new GetObjectCommand({
      Bucket: r.s3.bucket.name,
      Key: r.s3.object.key
    })

    const blocks = new Map<string, Uint8Array>()
    const index = new LinkIndexer()

    await pRetry(async () => {
      const res = await s3.send(getCmd)
      // @ts-ignore Body is AsyncIterable in Node.js
      const carBlocks = await CarBlockIterator.fromIterable(res.Body)

      for await (const block of carBlocks) {
        // No leaves in the index
        if (block.cid.code === raw.code) continue
        index.decodeAndIndex(block)
        blocks.set(block.cid.toString(), block.bytes)
      }
    }, {
      retries: MAX_RETRIES,
      onFailedAttempt: err => console.error('reading CAR', err)
    })

    const command = createDynamoBatchWriteCommand(index, blocks)
    await pRetry(async () => db.send(command), {
      retries: MAX_RETRIES,
      onFailedAttempt: err => console.error('writing to DynamoDB', err)
    })
  }
}

function createDynamoBatchWriteCommand (index: LinkIndexer, blocks: Map<string, Uint8Array>) {
  const input: BatchWriteItemCommandInput = { RequestItems: { [DYNAMO_TABLE]: [] } }
  for (const [cid, links] of index.idx) {
    const bytes = blocks.get(cid)
    if (!bytes) throw new Error(`missing link: ${cid}`)
    input.RequestItems[DYNAMO_TABLE].push({
      PutRequest: {
        Item: {
          cid: { S: cid },
          bytes: { B: bytes },
          links: { SS: Array.from(links) }
        }
      }
    })
  }
  return new BatchWriteItemCommand(input)
}

/**
 * Extract an S3Event from the passed SNSEvent.
 */
function toS3Event (snsEvent: SNSEvent) {
  const s3Event: S3Event = { Records: [] }
  for (const snsRec of snsEvent.Records) {
    try {
      for (const s3Rec of JSON.parse(snsRec.Sns.Message).Records || []) {
        if (s3Rec.eventSource !== 'aws:s3') continue
        s3Event.Records.push(s3Rec)
      }
    } catch (err) {
      console.error(`failed to extract S3Event record from SNSEvent record: ${err.message}`, snsRec)
    }
  }
  return s3Event
}
