// self 是 worker中的实例
// self.importScripts("/spark-md5.min.js");

// self.onmessage = (e) => {
//   const { chunkLists: file } = e.data;
//   console.log(file);
//   let spark = new self.SparkMD5.ArrayBuffer(); // 实例化加密
//   let progress = 0;
//   let count = 0;
//   const appendHash = (index) => {
//     let reader = new FileReader();
//     reader.readAsArrayBuffer(file);
//     reader.onload = (e) => {
//       // 读取成功
//       count++;
//       spark.append(e.target.result);

//       // 全部都添加hash了
//       self.postMessage({
//         progress: 100,
//         hash: spark.end(), // 这里的hash 是整个文件的hash
//       });
//       self.close(); // 关闭 worker进程
//     };
//   };
//   appendHash(0);
// };

// self 是 worker中的实例
self.importScripts("/spark-md5.min.js");

self.onmessage = (e) => {
  const { chunkLists } = e.data;
  let spark = new self.SparkMD5.ArrayBuffer(); // 实例化加密
  let progress = 0;
  let count = 0;
  const appendHash = (index) => {
    let reader = new FileReader();
    reader.readAsArrayBuffer(chunkLists[index].file);
    reader.onload = (e) => {
      // 读取成功
      count++;
      spark.append(e.target.result);
      if (count === chunkLists.length) {
        // 全部都添加hash了
        self.postMessage({
          progress: 100,
          hash: spark.end(), // 这里的hash 是整个文件的hash
        });
        self.close(); // 关闭 worker进程
      } else {
        progress = (progress + 100 / chunkLists.length).toFixed(1) - 0;
        self.postMessage({
          progress,
        });
        // 进行下一个文件
        appendHash(count);
      }
    };
  };
  appendHash(count);
};
