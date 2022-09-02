"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkdexStack = void 0;
const resources_1 = require("@serverless-stack/resources");
function LinkdexStack({ stack }) {
    const bucket = new resources_1.Bucket(stack, 'cars');
    const api = new resources_1.Api(stack, "api", {
        defaults: {
            function: {
                permissions: [bucket]
            }
        },
        routes: {
            "GET /": "functions/linkdex.handler",
        }
    });
    stack.addOutputs({
        ApiEndpoint: api.url
    });
}
exports.LinkdexStack = LinkdexStack;
