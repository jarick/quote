import { useCallback, useEffect, useMemo, useState } from 'react';
import throttle from './throttle';

function getSymbolsSelector(symbols, { by }) {
  return symbols.sort((a, b) => {
    return b[by] - a[by];
  });
}

function parseJSON(data) {
  try {
    return JSON.parse(data);
  } catch(e) {
    console.error(e);
    return {};
  }
}

const columnsMap = {
  BID: 'bid',
  ASK: 'ask',
  HIGH: 'high',
  LOW: 'low',
  LAST: 'last',
};
const COLUMNS = Object.values(columnsMap);
const API_URL = 'wss://api.exchange.bitcoin.com/api/2/ws';
const statuses = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
}
const TIMEOUT = 1000;

function App() {
  const [status, setStatus] = useState(statuses.DISCONNECTED);
  const [symbols, setSymbols] = useState([]);
  const [labels, setLabels] = useState({});
  const [sort, setSort] = useState({ by: columnsMap.LAST });
  const debouncedSetSymbols = useMemo(() => throttle(setSymbols, TIMEOUT), []);
  const data = useMemo(() => getSymbolsSelector(symbols, sort), [symbols, sort]);

  useEffect(() => {
    let socket;
    let symbols = [];

    function connect() {
      setStatus(statuses.CONNECTING);
      socket = new WebSocket(API_URL);

      socket.onmessage = function (event) {
        const data = parseJSON(event.data);

        if (data.id === 1 && Array.isArray(data.result)) {
          setLabels(data.result.reduce((acc, item) => ({ 
            ...acc,
            [item.id]: `${item.quoteCurrency} / ${item.baseCurrency}`,
          }), {}));

          data.result.forEach(({ id }, index) => {
            socket.send(JSON.stringify({
              id: index + 2,
              method: 'subscribeTicker',
              params: { symbol: id },
            }));
          });
        }

        if (data.method === 'ticker') {
          const payload = COLUMNS.reduce((acc, item) => ({
            ...acc,
            [item]: parseFloat(data.params[item]).toFixed(2), 
          }), { id: data.params.symbol });

          
          const index = symbols.findIndex(item => item.id === payload.id)
          if (index > -1) {
            symbols[index] = payload;
          } else {
            symbols.push(payload);
          }
          debouncedSetSymbols([...symbols]);
        }
      }

      socket.onopen = function () {
        setStatus(statuses.CONNECTED);

        socket.send(JSON.stringify({
          id: 1,
          method: 'getSymbols',
          params: {},
        }));
      }

      socket.onclose = function (event) {
        socket = null;
        console.error(event);
        setStatus(statuses.DISCONNECTED);
        setTimeout(() => connect(), TIMEOUT);
      }

      socket.onerror = function (event) {
        console.error(event);
        socket.close();
      };
    }

    connect();

    return () => {
      if (socket) {
        socket.close();
        socket = null;
      }
    };
  }, [debouncedSetSymbols]);

  const handleSort = useCallback((event) => {
    const by = event.target.getAttribute('data-by');

    setSort({ by });
  }, [])

  return (
    <div className="content">
      <h1>Exchange Quotes ({status})</h1>
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            {COLUMNS.map(column => (
              <th key={column} data-by={column} onClick={handleSort}>
                {column}{sort.by === column && ' ▼'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(item => (
            <tr key={item.id}>
              <td>{labels[item.id]}</td>
              {COLUMNS.map(column => (
                <td key={column}>{isNaN(item[column]) ? '---' : item[column]}</td>  
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
