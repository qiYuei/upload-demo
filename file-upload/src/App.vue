<template>
  <div id="app">
    <div class="simple-upload-container">
      <div class="total-progress">
        <div class="btns">
          <el-button-group>
            <el-button>
              <i class="el-icon-upload2 el-icon--left" size="mini"></i>选择文件
              <input
                type="file"
                class="select-file-input"
                @change="handleFileChange"
              />
            </el-button>
            <el-button @click="handleUpload([])">
              <i class="el-icon-upload el-icon--left" size="mini"></i>上传
            </el-button>
            <el-button @click="handlePause">
              <i class="el-icon-video-pause el-icon--left" size="mini"></i>暂停
            </el-button>
            <el-button @click="handleResume">
              <i class="el-icon-video-play el-icon--left" size="mini"></i>恢复
            </el-button>
            <el-button @click="clearFiles">
              <i class="el-icon-video-play el-icon--left" size="mini"></i>清空
            </el-button>
          </el-button-group>
          <slot name="header"></slot>
        </div>
      </div>
      <el-collapse accordion>
        <el-collapse-item>
          <template slot="title">
            <div class="list-item" style="width:100%;">
              <div class="item-name">
                <span>文件名：{{ name }}</span>
              </div>
              <div class="item-progress">
                <span>文件hash处理：</span>
                <el-progress :percentage="progress" />
              </div>
            </div>
          </template>
          <el-table :data="data">
            <el-table-column
              prop="hash"
              label="切片hash"
              align="center"
            ></el-table-column>
            <el-table-column label="大小" align="center" width="120">
              <template v-slot="{ row }">{{
                row.size | transformByte
              }}</template>
            </el-table-column>
            <el-table-column label="进度" align="center">
              <template v-slot="{ row }">
                <el-progress
                  :percentage="row.percentage"
                  color="#909399"
                ></el-progress>
              </template>
            </el-table-column>
          </el-table>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script>
const SIZE = 1024 * 1024 * 2; // 每次切片大小
import { ajax } from "./ajax.js";
import { limit } from "./limt.js";
export default {
  name: "App",
  data() {
    return {
      data: [], // 存储每一个切片
      name: "",
      worker: null, // worker进程
      hash: "",
      progress: 0, //hash进度
      requestList: [],
    };
  },
  filters: {
    transformByte(size) {
      if (!size) {
        return "0B";
      }

      var num = 1024.0; // byte

      if (size < num) {
        return size + "B";
      }
      if (size < Math.pow(num, 2)) {
        return (size / num).toFixed(2) + "K";
      } // kb
      if (size < Math.pow(num, 3)) {
        return (size / Math.pow(num, 2)).toFixed(2) + "M";
      } // M
      if (size < Math.pow(num, 4)) {
        return (size / Math.pow(num, 3)).toFixed(2) + "G";
      } // G
      return (size / Math.pow(num, 4)).toFixed(2) + "T"; // T
    },
  },
  methods: {
    async limit(arrs, max = 4) {
      return new Promise((resolve, reject) => {
        const len = arrs.length;
        let fininsh = 0; // 已完成数量
        let current = 0; // 当前索引
        let result = []; // 存放结果
        const request = (index) => {
          let ind = index || current;
          ajax({
            url: "/admin/chunkUpload",
            data: arrs[ind].formData,
            onProgress: this.factory(ind),
            requestList: this.requestList,
          })
            .then((res) => {
              fininsh++;
              result[index] = res;
              request();
            })
            .catch((e) => {
              if (result[ind]) {
                // 有值说明已经重试过
                if (result[ind] > max - 1) {
                  result[ind] = e;
                  fininsh++;
                } else {
                  result[ind] += 1;
                  request(ind);
                }
              } else {
                result[ind] = 1;
                request(ind);
              }
            });

          !index && current++;
          if (fininsh === len) {
            // 全部都完成
            resolve(result);
          }
        };
        for (let i = 0; i < max; i++) {
          // 先发送max个请求 请求结束或者 失败 补上
          request();
        }
      });
    },
    handlePause() {
      this.requestList.forEach((http) => {
        http && http.abort(); // 取消上传
      });
    },
    clearFiles() {
      this.data = [];
      this.name = "";
      this.worker = null; // worker进程
      this.hash = "";
      this.progress = 0; //hash进度
      this.requestList = [];
    },
    async handleResume() {
      // 先去此文件的hash 看有那个chunk已经上传完毕
      const res = await ajax({
        url: "/admin/verifyChunk",
        data: JSON.stringify({
          fileName: this.name,
          hash: this.hash,
        }),
        headers: {
          "content-type": "application/json",
        },
      });

      const v = res && JSON.parse(res.data);

      this.uploadedList = v.code === 500 ? [] : v.data;
      this.handleUpload(this.uploadedList);
    },
    //  计算hash  靠 web-worker进程 减轻主线程的压力
    calculateHash(chunkLists) {
      return new Promise((resolve, reject) => {
        this.worker = new Worker("/hash.js"); // 引入具体的脚本

        this.worker.postMessage({ chunkLists }); // 向worker进程传递数据
        this.worker.onmessage = (e) => {
          // 响应处理
          let { progress, hash } = e.data;
          if (progress > 100) {
            progress = 100;
          }
          this.progress = progress;
          if (hash) {
            //说明已经读取完整个文件的hash
            resolve(hash);
          }
        };
      });
    },
    async handleFileChange(e) {
      let file = e.target.files[0]; //获取到文件对象类型为 blod
      this.name = file.name;
      let chunkList = this.spliteFileToChunk(file);
      this.hash = await this.calculateHash(chunkList);
      this.data = chunkList.map((item, index) => ({
        hash: this.hash + "-" + index, // 临时起一个标识
        chunk: item.file,
        name: file.name,
        size: item.file.size, // 切片大小
        percentage: 0, // 当前进度
      }));
    },
    spliteFileToChunk(file) {
      let current = 0;
      let chunkList = [];
      while (current < file.size) {
        chunkList.push({
          file: file.slice(current, current + SIZE),
        });
        current += SIZE;
      }
      return chunkList; // 这样就得到了文件的所有切片
    },
    async handleUpload(uploadedList = []) {
      // 上传之前先看是否上传过
      const res = await this.verifyFile();
      if (!res) {
        // 已经上传
        // 这里是秒传的逻辑
        this.data.forEach((item) => {
          item.percentage = 100;
        });
        return false;
      }
      uploadedList.forEach((val) => {
        this.data[val].percentage = 100;
      });
      let requestList = this.data
        .filter((item, index) => {
          return !uploadedList.includes(index);
        })
        .map(({ chunk, hash, name }, index) => {
          let formData = new FormData();
          formData.append("file", chunk);
          formData.append("hash", hash);
          formData.append("name", name);
          return { formData, index };
        });
      // 限制并发数
      await this.limit(requestList, 4);
      try {
        if (requestList.length + uploadedList.length === this.data.length) {
          await this.startMerge();
          this.data.forEach((item) => {
            item.percentage = 100;
          });
        }
      } catch (e) {
        console.log(e, "出错了诶");
      }
    },
    startMerge() {
      return ajax({
        url: "/admin/sendEnd",
        data: JSON.stringify({
          name: this.name,
          hash: this.hash,
        }),
        headers: {
          "content-type": "application/json",
        },
      });
    },
    // 上传前校验 是否已经上传过了
    async verifyFile() {
      const res = await ajax({
        url: "/admin/verifyFile",
        method: "post",
        data: JSON.stringify({
          fileName: this.name,
          hash: this.hash,
        }),
        headers: {
          "content-type": "application/json",
        },
      });
      let v = res && JSON.parse(res.data).shouldUpload;
      return v;
    },
    // 工厂函数 为每个切片提供自己的监听函数
    factory(index) {
      return (e) => {
        this.data[index].percentage = parseInt(
          String((e.loaded / e.total) * 100)
        );
      };
    },
  },
};
</script>

<style scoped lang="scss">
.simple-upload-container {
  width: 100%;
  border: 1px solid #d2d2d2;
  border-radius: 4px;
  background-color: #fff;
  padding-bottom: 15px;
  padding: 10px;
  .progress-box {
    width: 100%;
  }
  .total-progress {
    margin-bottom: 15px;
    .btns {
      position: relative;
      .select-file-input {
        position: absolute;
        display: inline-block;
        left: 0;
        top: 0;
        border: none;
        opacity: 0;
        width: 96px;
        height: 28px;
      }
    }
  }

  .list-item {
    padding: 8px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    line-height: 25px;
    position: relative;
    &:hover .item-chunk-box {
      display: block;
    }
    div {
      flex: 1;
      margin-top: 6px;
    }
    .item-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 6px;
      .svg-icon {
        font-size: 22px;
        vertical-align: sub;
      }
    }
    .item-status {
      flex: 0 0 10%;
      text-align: center;
      text-align: left;
      .el-icon-circle-check {
        color: #67c23a;
      }
      .el-icon-circle-close {
        color: #f00;
      }
    }
    .item-chunk-box {
      display: none;
      transition: all 3s;
      position: absolute;
      top: 0;
      left: 40px;
      z-index: 10;
    }
    .item-progress {
      flex: 0 0 60%;
    }
  }

  .upload-tip {
    font-size: 12px;
    color: #606266;
    margin-top: 7px;
  }

  .el-progress {
    width: 80%;
    display: inline-block;
  }

  >>> .el-collapse-item__header {
    height: auto;
  }
}
.titlebox {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
