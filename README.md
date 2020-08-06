### 实现大文件上传

#### 技术栈

> vue+elementUI+spark-md5(处理文件 hash)+koa2

#### 功能包括

- worker 进程对文件 md5 处理
- 限制并发请求
- 断点续传
- 秒传
- 错误重试
