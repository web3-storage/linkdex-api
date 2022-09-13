import test from 'ava'
import * as pb from '@ipld/dag-pb'
import { encode } from 'multiformats/block'
import { identity } from 'multiformats/hashes/identity'
import { CarBufferWriter } from '@ipld/car'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { createS3, createBucket } from './_s3.js'
import { getLinkdexReportForCid, groupByPrefixSortByObjectCount } from '../functions/linkdex-cid.js'

test.before(async t => {
  t.context.s3 = await createS3()
})

test('groupByPrefixSortByObjectCount', async t => {
  const input = [
    { Key: 'raw/cid1/uid1/1.car' },
    { Key: 'raw/cid1/uid2/2.car' },
    { Key: 'raw/cid1/uid2/3.car' }
  ]
  const res = groupByPrefixSortByObjectCount(input)
  t.deepEqual(res, [
    [input[1].Key, input[2].Key ],
    [input[0].Key ]
  ], 'should be grouped by uid and ordered by size')
})

test('complete CAR', async t => {
  const { s3 } = t.context
  const bucket = await createBucket(s3)
  const block1 = await encode({ value: pb.prepare({ Data: 'one' }), codec: pb, hasher })
  const block2 = await encode({ value: pb.prepare({ Data: 'two' }), codec: pb, hasher })
  const parent = await encode({ value: pb.prepare({ Links: [block1.cid, block2.cid] }), codec: pb, hasher })
  const car = CarBufferWriter.createWriter(Buffer.alloc(1000), { roots: [parent.cid]})
  car.write(parent)
  car.write(block1)
  car.write(block2)
  const key = `raw/${parent.cid.toString()}/user/complete.car`
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: car.close() }))
  // should ignore non-car files
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `${key}.idx`, Body: 'i am an index' }))
  const res = await getLinkdexReportForCid(parent.cid.toString(), bucket, s3)
  t.is(res.statusCode, 200, res.body)
  const report = JSON.parse(res.body)
  t.deepEqual(report, {
    structure: 'Complete'
  })
})

test('complete if any user has complete DAG', async t => {
  const { s3 } = t.context
  const bucket = await createBucket(s3)

  // make dag
  const block1 = await encode({ value: pb.prepare({ Data: 'one' }), codec: pb, hasher })
  const block2 = await encode({ value: pb.prepare({ Data: 'two' }), codec: pb, hasher })
  const parent = await encode({ value: pb.prepare({ Links: [block1.cid, block2.cid] }), codec: pb, hasher })
  
  // make parial car 1
  const car1 = CarBufferWriter.createWriter(Buffer.alloc(1000), { roots: [parent.cid]})
  car1.write(parent)
  car1.write(block1)
  const car1Bytes = car1.close()
  
  // make parial car 2
  const car2 = CarBufferWriter.createWriter(Buffer.alloc(1000), { roots: [parent.cid]})
  car2.write(parent)
  car2.write(block2)
  const car2Bytes = car2.close()

  // user1 has only partial CAR
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `raw/${parent.cid.toString()}/user1/part1.car`, Body: car1Bytes }))

  // user2 has both patials which make a complete
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `raw/${parent.cid.toString()}/user2/part1.car`, Body: car1Bytes }))
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `raw/${parent.cid.toString()}/user2/part2.car`, Body: car2Bytes }))

  const res = await getLinkdexReportForCid(parent.cid.toString(), bucket, s3)
  t.is(res.statusCode, 200)
  const report = JSON.parse(res.body)
  t.deepEqual(report, { structure: 'Complete' })
})

test('partial if no user has complete dag', async t => {
  const { s3 } = t.context
  const bucket = await createBucket(s3)

  // make dag
  const block1 = await encode({ value: pb.prepare({ Data: 'one' }), codec: pb, hasher })
  const block2 = await encode({ value: pb.prepare({ Data: 'two' }), codec: pb, hasher })
  const parent = await encode({ value: pb.prepare({ Links: [block1.cid, block2.cid] }), codec: pb, hasher })
  
  // make parial car 1
  const car1 = CarBufferWriter.createWriter(Buffer.alloc(1000), { roots: [parent.cid]})
  car1.write(parent)
  car1.write(block1)
  const car1Bytes = car1.close()
  
  // make parial car 2
  const car2 = CarBufferWriter.createWriter(Buffer.alloc(1000), { roots: [parent.cid]})
  car2.write(parent)
  car2.write(block2)
  const car2Bytes = car2.close()

  // user1 has only partial CAR
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `raw/${parent.cid.toString()}/user1/part1.car`, Body: car1Bytes }))

  // user2 has only partial CAR
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `raw/${parent.cid.toString()}/user2/part2.car`, Body: car2Bytes }))

  const res = await getLinkdexReportForCid(parent.cid.toString(), bucket, s3)
  t.is(res.statusCode, 200)
  const report = JSON.parse(res.body)
  t.deepEqual(report, { structure: 'Partial' })
})
  
