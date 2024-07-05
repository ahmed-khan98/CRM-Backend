import express from 'express';
import { config } from 'dotenv';
config()

import routes from './routes';

const app = express();
const port = process.env.PORT || 3000; // Use environment variable or default to 3000

// Define routes and middleware here (more on these later)

app.use(routes)

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});