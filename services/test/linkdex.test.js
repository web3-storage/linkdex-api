import test from 'ava'
import * as pb from '@ipld/dag-pb'
import { customAlphabet } from 'nanoid'
import { encode } from 'multiformats/block'
import { identity } from 'multiformats/hashes/identity'
import { CarBufferWriter } from '@ipld/car'
import { GenericContainer } from 'testcontainers'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { S3Client, CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getLinkdexReport } from '../functions/linkdex.js'

test.before(async t => {
  t.context.s3 = await createS3()
})

test('ignores non CAR files', async t => {
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

async function createS3 (){
  const minio = await new GenericContainer('quay.io/minio/minio')
    .withCmd(['server', '/data'])
    .withExposedPorts(9000).start()
  const s3 = new S3Client({
    endpoint: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`,
    forcePathStyle: true,
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'minioadmin',
      secretAccessKey: 'minioadmin'
    }
  })
  return s3
}

async function createBucket (s3) {
  const id = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 10)
  const Bucket = id()
  await s3.send(new CreateBucketCommand({ Bucket }))
  return Bucket
}
