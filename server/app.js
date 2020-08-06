const koa = require("koa");
const app = new koa();

const koaBody = require("koa-body");
const upload = require("./upload");
const cors = require("koa2-cors");

//跨域处理
app.use(cors());

app.use(
  koaBody({
    multipart: true, // 支持文件上传
  })
);
// app.use(ctx => {
//     ctx.body = 'Hello World';
// });
// app.use(router.routes());
// app.use(router.allowedMethods())
app.use(upload.routes(), upload.allowedMethods());

app.listen(3000, () => {
  console.log("http://localhost:3000");
});
