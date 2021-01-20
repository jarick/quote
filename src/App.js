import { useCallback, useEffect, useMemo, useState } from "react";

function throttle(callback, wait, immediate = false) {
  let timeout = null 
  let initialCall = true
  
  return function() {
    const callNow = immediate && initialCall
    const next = () => {
      callback.apply(this, arguments)
      timeout = null
    }
    
    if (callNow) { 
      initialCall = false
      next()
    }

    if (!timeout) {
      timeout = setTimeout(next, wait)
    }
  }
}

function getSymbolsSelector(symbols, { by }) {
  return symbols.sort((a, b) => {
    return b[by] - a[by];
  });
}

function App() {
  const [status, setStatus] = useState('disconnected');
  const [symbols, setSymbols] = useState([]);
  const [labels, setLabels] = useState({});
  const [sort, setSort] = useState({ by: 'last' });
  const debouncedSetSymbols = useMemo(() => throttle(setSymbols, 1000), []);
  const data = useMemo(() => getSymbolsSelector(symbols, sort), [symbols, sort]);

  useEffect(() => {
    let socket;
    let symbols = [];

    function connect() {
      setStatus('connecting');
      socket = new WebSocket("wss://api.exchange.bitcoin.com/api/2/ws");

      socket.onmessage = function (event) {
        let data 
        try {
          data = JSON.parse(event.data);
        } catch(e) {
          console.error(e);
          data = {};
        }

        if (data.id === 1 && Array.isArray(data.result)) {
          setLabels(data.result.reduce((acc, item) => ({ 
            ...acc,
            [item.id]: `${item.quoteCurrency} / ${item.baseCurrency}`,
          }), {}));

          data.result.forEach(({ id }, index) => {
            socket.send(JSON.stringify({
              id: index + 2,
              method: "subscribeTicker",
              params: { symbol: id },
            }));
          });
        }

        if (data.method === 'ticker') {
          const payload = ['bid', 'ask', 'high', 'low', 'last'].reduce((acc, item) => ({
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
        setStatus('connected');

        socket.send(JSON.stringify({
          id: 1,
          method: 'getSymbols',
          params: {},
        }));
      }

      socket.onclose = function (event) {
        socket = null;
        console.error(event);
        setStatus('disconnected');
        setTimeout(() => connect(), 1000);
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
            {['bid', 'ask', 'high', 'low', 'last'].map(column => (
              <th key={column} data-by={column} onClick={handleSort}>
                {column}{sort.by === column && ' ▲'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(item => (
            <tr key={item.id}>
              <td>{labels[item.id]}</td>
              {['bid', 'ask', 'high', 'low', 'last'].map(column => (
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
