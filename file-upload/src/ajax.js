export const ajax = function({
  url,
  method = "post",
  data,
  headers = {},
  onProgress = (e) => e,
  requestList = [],
}) {
  let baseUrl = `http://localhost:3000`;
  return new Promise((resolve) => {
    let http = new XMLHttpRequest();
    http.open(method, baseUrl + url);
    Object.keys(headers).forEach((header) => {
      http.setRequestHeader(header, headers[header]);
    });
    http.send(data);
    http.onprogress = onProgress; // 监听进度条
    http.onload = (e) => {
      if (requestList.length > 0) {
        const xhrIndex = requestList.findIndex((item) => item === http);
        requestList.splice(xhrIndex, 1);
      }
      resolve({
        data: e.target.response,
      });
    };
    requestList?.push(http);
  });
};
