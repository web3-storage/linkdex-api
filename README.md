# linkdex-api

A lambda and REST api to check DAG completeness across one or more CARs

Give it an s3 key to a CAR you just upladed as `key`, and it tells you if we have a complete DAG for the root CID.

We check if the key provided exists first. If you know the path and hash of CAR then you are probably dotStorage.

```console
curl https://linkdex.api?key=raw/bafy/userid-ish/1.car
{
  cars: [
    'raw/bafybeifxyl3vcq4utm4rwfmoqn3cryc7bmuu3rxz47mrgftmayem3sewum/user/part1.car',
    'raw/bafybeifxyl3vcq4utm4rwfmoqn3cryc7bmuu3rxz47mrgftmayem3sewum/user/part2.car'
  ],
  structure: 'Partial',
  blocksIndexed: 4,
  blocksUnique: 3,
  blocksUndecodeable: 0
```

Uses [`linkdex`](https://github.com/web3-storage/linkdex) to figure out if the dag the DAG structure

## Getting started

Uses [SST](https://sst.dev) to wrangle AWS infra. Ensure you are logged in to aws-cli locally then

```console
# install deps
$ npm i

# uses docker, check dag completeness over CARs in an S3
$ npm test -w services

# deploy dev infra
$ npm start
```

see: https://sst.dev/chapters/configure-the-aws-cli.html
