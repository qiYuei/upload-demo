/**
 *  arrs 是全部一个数组里面全是promise
 *  max  最大并发数
 */

export const limit = function(arrs, max = 4) {
  return new Promise((resolve, reject) => {
    const len = arrs.length;
    let fininsh = 0; // 已完成数量
    let current = 0; // 当前索引
    let result = []; // 存放结果
    const request = function(index) {
      let ind = index || current;
      arrs[ind]
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
      // 先发送max个请求
      request();
    }
  });
};
