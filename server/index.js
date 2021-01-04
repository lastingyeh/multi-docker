const keys = require('./keys');

// Express App Setup
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(bodyParser.json());

// Postgres Client Setup
const { Pool } = require('pg');
const pgClient = new Pool({
    user: keys.pgUser,
    host: keys.pgHost,
    database: keys.pgDatabase,
    password: keys.pgPassword,
    port: keys.pgPort,
});

pgClient
    .on('connect', (client) => {
        console.log('database is connecting.');

        client
            .query('CREATE TABLE IF NOT EXISTS values (number INT)')
            .catch((err) => console.log(err));
    })
    .on('error', () => {
        console.log('Lost PG connection');
    });

// Redis Client Setup
const redis = require('redis');
const redisClient = redis.createClient({
    host: keys.redisHost,
    port: keys.redisPort,
    retry_strategy: () => 1000,
});
const redisPublisher = redisClient.duplicate();

// Express route handlers
app.get('/', (req, res) => {
    res.send('Hi');
});

app.get('/values/all', async (req, res) => {
    const values = await pgClient.query('SELECT * FROM values');

    res.send(values.rows);
});

app.get('/values/current', async (req, res) => {
    redisClient.hgetall('values', (err, values) => {
        res.send(values);
    });
});

app.post('/values', async (req, res) => {
    const index = req.body.index;

    if (+index > 40) {
        return res.status(422).send('Index too high');
    }

    redisClient.hset('values', index, 'Nothing yet!');
    // push 'insert' event to worker
    redisPublisher.publish('insert', index);

    const values = await pgClient.query('SELECT number FROM values WHERE number = $1', [index]);

    if (values.rows.length === 0) {
        await pgClient.query('INSERT INTO VALUES(number) VALUES($1)', [index]);
    }

    res.send({ working: true });
});

app.listen(5000, (err) => {
    console.log('Listening at port 5000');
});
