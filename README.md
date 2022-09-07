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

# test it. Uses docker, check dag completeness over CARs in an S3
$ npm test -w services

# deploy dev infra
$ npm start
```

You now have a dev copy of the infra deployed pointing to an empty bucket. You should add some cars under `raw/<cid>/<uid>/<foo.car>` and then query for them to try it out.

To test it against the `staging` dotstorage bucket you need to
- open `.env` and uncomment the `BUCKET_NAME` var.
- sign in to the `aws` cli with a user on the `nitro` account, or set up a profile by adding keys to your `~/.aws/credentials` file like

```
[nitro]
aws_access_key_id = <your key id here>
aws_secret_access_key = <your secret key here>
```

- deploy using that profile like 
```shell
$ AWS_PROFILE=nitro npx sst deploy --stage <your username, e.g olizilla>
Stack olizilla-linkdex-api-LinkdexStack
  Status: deployed
  Outputs:
    ApiEndpoint: https://???.execute-api.us-east-2.amazonaws.com
```
  - the `stage` value is used as a prefix on all the resources to identify them, allowing multiple environements to co-exist on a single account.
- the lambda and api will be deployed to `us-east-2` by default as defined in `sst.json`
- the `ApiEndpoint` is given at the end of the deployment and can now be used to test out the api
```shell
curl -sS 'https://???.execute-api.us-east-2.amazonaws.com?key=raw/bafkreia223gzz3t46ajnosijo3mgajipbyjyikwbhbkabmsqdal6o4k6uu/315318734258473247/ciqi26nuu3dnsi2dirisvxmz3jlamyocdpmfpdpxniktfjsffmcodnq.car' | jq
{
  "cars": [
    "raw/bafkreia223gzz3t46ajnosijo3mgajipbyjyikwbhbkabmsqdal6o4k6uu/315318734258473247/ciqi26nuu3dnsi2dirisvxmz3jlamyocdpmfpdpxniktfjsffmcodnq.car"
  ],
  "structure": "Complete",
  "blocksIndexed": 1,
  "blocksUnique": 1,
  "blocksUndecodeable": 0
}
```

see: https://sst.dev/chapters/configure-the-aws-cli.html
