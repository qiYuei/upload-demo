// const router = require('koa-router')()
const Router = require("@koa/router");
const router = new Router();
const fse = require("fs-extra");
const path = require("path");
router.prefix("/admin");

const SIZE = 1024 * 1024 * 2; // 每次切片大小
// 保存文件目录
const UPLOAD_DIR = path.resolve(__dirname, "..", "target"); // 大文件存储目录

// 去除后缀名
const removeExt = (fileName) => {
  return fileName.slice(0, fileName.lastIndexOf("."));
};

const extractExt = (filename) =>
  filename.slice(filename.lastIndexOf("."), filename.length); // 提取后缀名

/**
 * 合并切片-创建可读流
 * @param {*} chunkMkdirs 切片组的目录
 * @param {*} chunkDir 切片组所在的文件夹
 * @param {*} filePath 文件名（新文件文件名）
 */
const mergeChunk = async (chunkMkdirs, chunkDir, filePath) =>
  await Promise.all(
    chunkMkdirs.map(async (chunkPath, index) => {
      // 根据chunkPath 路径创建可写流
      let chunk = path.resolve(chunkDir, chunkPath); // 这就是完整的chunk路径

      let writePath = path.resolve(UPLOAD_DIR, filePath) + "\\";

      let writeStream = fse.createWriteStream(writePath, {
        encoding: "binary",
        start: index * SIZE,
        end: (index + 1) * SIZE,
      });
      writeStream.on("error", (err) => {
        console.log(err, "读取发生的异常");
      });
      return pipeStream(chunk, writeStream);
    })
  );

/**
 * 合并切片创建新文件
 * @param {*} path 切片路径
 * @param {*} writeStream  写入流
 */
const pipeStream = (path, writeStream) =>
  new Promise((resolve) => {
    const readStream = fse.createReadStream(path);
    readStream.on("end", () => {
      fse.unlinkSync(path); // 删除切片
      resolve();
    });
    readStream.on("error", (err) => {
      console.log(err, "写入发生的异常");
    });
    readStream.pipe(writeStream); // 将切片通过管道写入流=> 生成新文件
  });

// 根据文件名返回路径
const getPathByFileName = (hash) => {
  // let fileDirPath = path.resolve(UPLOAD_DIR, removeExt(fileName));
  let fileDirPath = path.resolve(UPLOAD_DIR, hash);
  if (fse.existsSync(fileDirPath)) {
    // 说明目录存在
    return fileDirPath;
  }
  return {
    message: "该文件没有上传记录",
  };
};
router
  .post("/chunkUpload", async (ctx) => {
    let chunk = ctx.request.files.file; // 接收的文件
    let fileName = ctx.request.body.name;
    let hash = ctx.request.body.hash; // 文件命名
    let DirName = hash.split("-")[0];
    let name = removeExt(fileName); // 没有文件后缀名
    const chunkDir = path.resolve(UPLOAD_DIR, DirName); // hash 作为文件夹名

    // 切片目录不存在，创建切片目录
    if (!fse.existsSync(chunkDir)) {
      await fse.mkdirs(chunkDir);
    }
    // 移动
    await fse.move(chunk.path, `${chunkDir}/${hash}`);
    ctx.body = `file remove ${chunkDir}`;
  })
  .post("/sendEnd", async (ctx) => {
    // 开始合并对应的chunk
    const { name: fileName, hash } = ctx.request.body;

    const chunkDir = path.resolve(UPLOAD_DIR, hash); //根据文件名寻找对应的文件夹路径
    const filePath = path.resolve(
      UPLOAD_DIR,
      `${removeExt(fileName)}--${hash}${extractExt(fileName)}`
    ); //生成的文件加上hash签名
    // 读取这个文件夹
    let chunkPaths = await fse.readdir(chunkDir); // 这里就是全部文件路径
    // 根据chunk 标识来重新排序 防止顺序错乱导致文件损坏
    chunkPaths.sort((a, b) => {
      return a.split("-")[1] - b.split("-")[1];
    });

    // 可写流汇入成一个文件
    await mergeChunk(chunkPaths, chunkDir, filePath).then((res) => {
      ctx.body = `merge success~`;
    });

    // 读取这个文件夹的文件 创建可写流 并删去chunk文件

    fse.rmdirSync(chunkDir); // 合并后删除保存切片的目录
  })

  // 文件暂停 续传 -> 查询是否已经有这个文件的chunk了
  .post("/verifyChunk", async (ctx) => {
    const { fileName, hash } = ctx.request.body;

    // 根据文件名返回 文件路径
    const filePath = getPathByFileName(hash);
    if (typeof filePath === "object") {
      // 要么hash不一致 要么就没有上传过
      ctx.body = {
        data: filePath.data,
        code: 500,
      };
    }
    let chunkPaths = fse.readdirSync(filePath);

    // 找出已经上传文件chunk序号
    const uploadedIndex = chunkPaths.map((chunkPath) => {
      return chunkPath.split("-")[1] - 0;
    });

    ctx.body = {
      data: uploadedIndex || [],
    };
  })

  // 秒传  -> 查看文件是否已经生成
  .post("/verifyFile", async (ctx) => {
    const { fileName, hash } = ctx.request.body;

    const filePath = path.resolve(
      UPLOAD_DIR,
      `${removeExt(fileName)}--${hash}${extractExt(fileName)}`
    );
    console.log(filePath, "file");
    if (fse.existsSync(filePath)) {
      // 找到
      ctx.body = {
        shouldUpload: false,
      };
    } else {
      // 没有找到
      ctx.body = {
        shouldUpload: true,
      };
    }
  });
module.exports = router;
