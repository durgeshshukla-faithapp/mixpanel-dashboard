import { Client as SSHClient } from 'ssh2';
import { Client as PgClient } from 'pg';
import net from 'net';

/**
 * Runs a single SQL query through an SSH tunnel to a Postgres server that
 * isn't directly reachable from the internet (bastion-host setup).
 *
 * Opens a fresh SSH connection + local forwarded port for every call, since
 * serverless functions can't keep a tunnel open between requests. This adds
 * ~1-3s latency per call - fine for an internal dashboard refreshed every
 * few minutes, not suitable for high-frequency queries.
 *
 * Required env vars:
 *   SSH_HOST, SSH_PORT (default 22), SSH_USER, SSH_PRIVATE_KEY (full PEM text)
 *   PG_HOST (as reachable FROM the SSH server, often "localhost" or "127.0.0.1")
 *   PG_PORT (default 5432), PG_DATABASE, PG_USER, PG_PASSWORD
 */
export function runPostgresQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    const ssh = new SSHClient();

    ssh.on('ready', () => {
      // Ask the SSH server to open a connection to Postgres on our behalf,
      // and pipe it through a random local port.
      ssh.forwardOut(
        '127.0.0.1', 0,
        process.env.PG_HOST || '127.0.0.1',
        Number(process.env.PG_PORT || 5432),
        async (err, stream) => {
          if (err) { ssh.end(); return reject(err); }

          const pgClient = new PgClient({
            host: 'localhost', // unused - we hand it the raw stream below
            database: process.env.PG_DATABASE,
            user: process.env.PG_USER,
            password: process.env.PG_PASSWORD,
            stream, // pg supports connecting over an arbitrary duplex stream
          });

          try {
            await pgClient.connect();
            const result = await pgClient.query(sql, params);
            await pgClient.end();
            ssh.end();
            resolve(result.rows);
          } catch (queryErr) {
            ssh.end();
            reject(queryErr);
          }
        }
      );
    });

    ssh.on('error', (err) => reject(err));

    ssh.connect({
      host: process.env.SSH_HOST,
      port: Number(process.env.SSH_PORT || 22),
      username: process.env.SSH_USER,
      privateKey: (process.env.SSH_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    });
  });
}

// Runs a query expected to return (date, count) rows and converts it into the
// same {sources, dates, data} matrix shape used everywhere else - so it can be
// merged directly into a Mixpanel dashboard's metrics as an extra option.
export async function runDateSeriesQuery(sql, sourceLabel = 'Postgres Data') {
  const rows = await runPostgresQuery(sql);
  const data = { [sourceLabel]: {} };
  const datesSet = new Set();

  rows.forEach((r) => {
    const values = Object.values(r);
    const [dateVal, numVal] = values;
    let iso;
    if (dateVal instanceof Date) iso = dateVal.toISOString().slice(0, 10);
    else iso = String(dateVal).slice(0, 10);
    data[sourceLabel][iso] = Number(numVal) || 0;
    datesSet.add(iso);
  });

  return {
    sources: [sourceLabel],
    dates: Array.from(datesSet).sort(),
    data,
  };
}
