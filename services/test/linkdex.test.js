import test from 'ava'
import * as pb from '@ipld/dag-pb'
import { encode } from 'multiformats/block'
import { identity } from 'multiformats/hashes/identity'
import { CarBufferWriter } from '@ipld/car'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { createS3, createBucket } from './_s3.js'
import { getLinkdexReport } from '../functions/linkdex.js'

test.before(async t => {
  t.context.s3 = await createS3()
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
  const res = await getLinkdexReport(key, bucket, s3)
  t.is(res.statusCode, 200)
  const report = JSON.parse(res.body)
  t.deepEqual(report, {
    cars: [ key ],
    structure: 'Complete',
    blocksIndexed: 3,
    uniqueCids: 3,
    undecodeable: 0
  })
})

test('complete CAR with identity CIDs as links', async t => {
  const { s3 } = t.context
  const bucket = await createBucket(s3)
  const id = await encode({ value: pb.prepare({ Data: 'itsa me! mario!' }), codec: pb, hasher: identity })
  const parent = await encode({ value: pb.prepare({ Links: [id.cid] }), codec: pb, hasher })
  const car = CarBufferWriter.createWriter(Buffer.alloc(1000), { roots: [parent.cid]})
  car.write(parent)
  const key = `raw/${parent.cid.toString()}/user/complete.car`
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: car.close() }))
  const res = await getLinkdexReport(key, bucket, s3)
  t.is(res.statusCode, 200)
  const report = JSON.parse(res.body)
  t.deepEqual(report, {
    cars: [ key ],
    structure: 'Complete',
    blocksIndexed: 1,
    uniqueCids: 2,
    undecodeable: 0
  })
})

test('complete CAR with identity CIDs as links and in CAR', async t => {
  const { s3 } = t.context
  const bucket = await createBucket(s3)
  const id = await encode({ value: pb.prepare({ Data: 'itsa me! mario!' }), codec: pb, hasher: identity })
  const parent = await encode({ value: pb.prepare({ Links: [id.cid] }), codec: pb, hasher })
  const car = CarBufferWriter.createWriter(Buffer.alloc(1000), { roots: [parent.cid]})
  car.write(parent)
  car.write(id)
  const key = `raw/${parent.cid.toString()}/user/complete.car`
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: car.close() }))
  const res = await getLinkdexReport(key, bucket, s3)
  t.is(res.statusCode, 200)
  const report = JSON.parse(res.body)
  t.deepEqual(report, {
    cars: [ key ],
    structure: 'Complete',
    blocksIndexed: 2,
    uniqueCids: 2,
    undecodeable: 0
  })
})

test('complete across 2 CARs', async t => {
  const { s3 } = t.context
  const bucket = await createBucket(s3)
  const block1 = await encode({ value: pb.prepare({ Data: 'one' }), codec: pb, hasher })
  const block2 = await encode({ value: pb.prepare({ Data: 'two' }), codec: pb, hasher })
  const parent = await encode({ value: pb.prepare({ Links: [block1.cid, block2.cid] }), codec: pb, hasher })
  const car1 = CarBufferWriter.createWriter(Buffer.alloc(1000), { roots: [parent.cid]})
  car1.write(parent)
  car1.write(block1)
  const key1 = `raw/${parent.cid.toString()}/user/part1.car`
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key1, Body: car1.close() }))
  const car2 = CarBufferWriter.createWriter(Buffer.alloc(1000), { roots: [parent.cid]})
  car2.write(parent)
  car2.write(block2)
  const key2 = `raw/${parent.cid.toString()}/user/part2.car`
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key2, Body: car2.close() }))
  
  const res = await getLinkdexReport(key2, bucket, s3)
  t.is(res.statusCode, 200)
  const report = JSON.parse(res.body)
  t.deepEqual(report, {
    cars: [ key1, key2 ],
    structure: 'Complete',
    blocksIndexed: 4,
    uniqueCids: 3,
    undecodeable: 0
  })
})

test('incomplete across 2 CARs', async t => {
  const { s3 } = t.context
  const bucket = await createBucket(s3)
  const block1 = await encode({ value: pb.prepare({ Data: 'one' }), codec: pb, hasher })
  const block2 = await encode({ value: pb.prepare({ Data: 'two' }), codec: pb, hasher })
  const block3 = await encode({ value: pb.prepare({ Data: 'three' }), codec: pb, hasher })
  const parent = await encode({ value: pb.prepare({ Links: [block1.cid, block2.cid, block3.cid] }), codec: pb, hasher })
  const car1 = CarBufferWriter.createWriter(Buffer.alloc(1000), { roots: [parent.cid]})
  car1.write(parent)
  car1.write(block1)
  const key1 = `raw/${parent.cid.toString()}/user/part1.car`
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key1, Body: car1.close() }))
  const car2 = CarBufferWriter.createWriter(Buffer.alloc(1000), { roots: [parent.cid]})
  car2.write(parent)
  car2.write(block2)
  const key2 = `raw/${parent.cid.toString()}/user/part2.car`
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key2, Body: car2.close() }))
  
  const res = await getLinkdexReport(key2, bucket, s3)
  t.is(res.statusCode, 200)
  const report = JSON.parse(res.body)
  t.deepEqual(report, {
    cars: [ key1, key2 ],
    structure: 'Partial',
    blocksIndexed: 4,
    uniqueCids: 3,
    undecodeable: 0
  })
})
