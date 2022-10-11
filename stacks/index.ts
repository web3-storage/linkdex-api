import { Tags } from "aws-cdk-lib";
import { LinkdexStack } from "./LinkdexStack";
import { App } from "@serverless-stack/resources";

export default function (app: App) {
  app.setDefaultFunctionProps({
    runtime: "nodejs16.x",
    srcPath: "services",
    bundle: {
      format: "esm",
    },
  });
  app.stack(LinkdexStack);
  
  // tags let us discover all the aws resource costs incurred by this app
  // see: https://docs.sst.dev/advanced/tagging-resources
  Tags.of(app).add('Project', 'linkdex-api')
  Tags.of(app).add('Repository', 'https://github.com/web3-storage/linkdex-api')
  Tags.of(app).add("Environment", `${app.stage}`)
  Tags.of(app).add('ManagedBy', 'SST')
}
