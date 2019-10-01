import Express from 'express';

export default class Server {
  app: Express.Express;

  constructor() {
    this.app = Express();
    this.app.get('/', function (req, res) {
      res.send('hello world')
    });
    this.app.listen(3000);
  }
}
