async function run() {
  const res = await fetch('https://data-api.polymarket.com/activity?user=0xc53375ff94e96100f2b30a4b5775db35218d69a9&limit=200');
  const data = await res.json();
  if (!Array.isArray(data)) {
    console.log('Data is not array:', data);
    return;
  }
  console.log('Total trades fetched:', data.length);
  const filtered = data.filter(t => t.type === 'TRADE' && (t.slug || '').startsWith('btc-updown-5m-'));
  console.log('BTC 5m trades:', filtered.length);

  // Filter between 9:20 AM and 10:20 AM today (November 2, 2026 ET or UTC / local time)
  // Let's print all btc-updown-5m trades and their timestamps in local/UTC time
  filtered.forEach((t, i) => {
    const d = new Date(t.timestamp * 1000);
    console.log(`[${i+1}] TS: ${t.timestamp} (${d.toISOString()}) | Slug: ${t.slug} | Side: ${t.side} | Outcome: ${t.outcome} | Price: ${t.price} | Size: ${t.size} | Usdc: ${t.usdcSize} | Tx: ${t.transactionHash}`);
  });
}
run();
