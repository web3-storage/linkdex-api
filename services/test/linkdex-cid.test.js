import anyTest from 'ava'
import * as pb from '@ipld/dag-pb'
import { encode } from 'multiformats/block'
import { CarBufferWriter } from '@ipld/car'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createS3, createBucket } from './_s3.js'
import { CompleteReporter, RawReporter, getLinkdexReportForCid, groupByPrefixSortByObjectCount } from '../functions/linkdex-cid.js'

const test = /** @type {import('ava').TestFn<{ s3: S3Client }>} */ (anyTest)

test.before(async t => {
  t.context.s3 = await createS3()
})

test('groupByPrefixSortByObjectCount', t => {
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

test('unknown CID', async t => {
  const { s3 } = t.context
  const bucket = await createBucket(s3)
  const cid = 'bafkreiefitw5jtbs6zqpapjcrrl5yzdass2su6dzr6ljbuhlczpry4iyi4'
  const reporters = [new RawReporter(bucket, s3)]
  const res = await getLinkdexReportForCid(cid, reporters)
  const report = JSON.parse(res.body || '{}')
  t.deepEqual(report, {
    cars: [],
    structure: 'Unknown',
    blocksIndexed: 0,
    uniqueCids: 0,
    undecodeable: 0
  })
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
  const reporters = [new RawReporter(bucket, s3)]
  const res = await getLinkdexReportForCid(parent.cid.toString(), reporters)
  t.is(res.statusCode, 200, res.body)
  const report = JSON.parse(res.body || '{}')
  t.deepEqual(report, {
    cars: [`${bucket}/raw/${parent.cid}/user/complete.car`],
    structure: 'Complete',
    blocksIndexed: 3,
    uniqueCids: 3,
    undecodeable: 0
  })
})

test('complete CAR from complete dir', async t => {
  const { s3 } = t.context
  const bucket = await createBucket(s3)
  const block1 = await encode({ value: pb.prepare({ Data: '1' }), codec: pb, hasher })
  const block2 = await encode({ value: pb.prepare({ Data: '2' }), codec: pb, hasher })
  const parent = await encode({ value: pb.prepare({ Links: [block1.cid, block2.cid] }), codec: pb, hasher })
  const car = CarBufferWriter.createWriter(Buffer.alloc(1000), { roots: [parent.cid]})
  car.write(parent)
  car.write(block1)
  car.write(block2)
  const key = `complete/${parent.cid}.car`
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: car.close() }))
  const reporters = [new CompleteReporter(bucket, s3)]
  const res = await getLinkdexReportForCid(parent.cid.toString(), reporters)
  t.is(res.statusCode, 200, res.body)
  const report = JSON.parse(res.body || '{}')
  t.deepEqual(report, {
    cars: [`${bucket}/complete/${parent.cid}.car`],
    structure: 'Complete',
    blocksIndexed: 3,
    uniqueCids: 3,
    undecodeable: 0
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

  const reporters = [new RawReporter(bucket, s3)]
  const res = await getLinkdexReportForCid(parent.cid.toString(), reporters)
  t.is(res.statusCode, 200)
  const report = JSON.parse(res.body || '{}')
  t.deepEqual(report, {
    cars: [
      `${bucket}/raw/${parent.cid}/user2/part1.car`,
      `${bucket}/raw/${parent.cid}/user2/part2.car`
    ],
    structure: 'Complete',
    blocksIndexed: 4,
    uniqueCids: 3,
    undecodeable: 0
  })
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

  const reporters = [new RawReporter(bucket, s3)]
  const res = await getLinkdexReportForCid(parent.cid.toString(), reporters)
  t.is(res.statusCode, 200)
  const report = JSON.parse(res.body || '{}')
  t.deepEqual(report, {
    cars: [`${bucket}/raw/${parent.cid}/user1/part1.car`],
    structure: 'Partial',
    blocksIndexed: 2,
    uniqueCids: 2,
    undecodeable: 0
  })
})
