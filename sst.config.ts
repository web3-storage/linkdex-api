import { SSTConfig } from 'sst'
import { Tags } from 'aws-cdk-lib'
import { LinkdexStack } from './stacks/LinkdexStack'

export default {
  config (_input) {
    return {
      name: 'linkdex-api',
      region: 'us-east-2'
    }
  },
  stacks (app) {
    app.setDefaultFunctionProps({
      runtime: 'nodejs18.x',
      nodejs: { sourcemap: true }
    })
    app.stack(LinkdexStack)

    // tags let us discover all the aws resource costs incurred by this app
    // see: https://docs.sst.dev/advanced/tagging-resources
    Tags.of(app).add('Project', 'linkdex-api')
    Tags.of(app).add('Repository', 'https://github.com/web3-storage/linkdex-api')
    Tags.of(app).add("Environment", `${app.stage}`)
    Tags.of(app).add('ManagedBy', 'SST')
  }
} satisfies SSTConfig
