"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const LinkdexStack_1 = require("./LinkdexStack");
function default_1(app) {
    app.setDefaultFunctionProps({
        runtime: "nodejs16.x",
        srcPath: "services",
        bundle: {
            format: "esm",
        },
    });
    app.stack(LinkdexStack_1.LinkdexStack);
}
exports.default = default_1;
