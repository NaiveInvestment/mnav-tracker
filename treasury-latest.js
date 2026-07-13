(() => {
  const latest = {"BMNR":{"holdings":[{"asset":"ETH","coins":5742237,"asOf":"2026-07-05"},{"asset":"BTC","coins":206,"asOf":"2026-07-05"}],"ethSupply":120700000,"capital":{"cash":527000000,"cashAsOf":"2026-07-05"},"source":"https://www.prnewswire.com/news-releases/bitmine-immersion-technologies-bmnr-announces-eth-holdings-reach-5-74-million-tokens-and-total-crypto-and-total-cash-holdings-of-11-1-billion-302818093.html","fetchedAt":"2026-07-13T04:51:25.266Z"}};
  globalThis.LATEST_TREASURY = latest;
  if (typeof TREASURY !== 'undefined' && TREASURY.BMNR) {
    const entry = [latest.BMNR.holdings[0].asOf, latest.BMNR.holdings[0].coins];
    const history = TREASURY.BMNR.coins;
    const existing = history.find(x => x[0] === entry[0]);
    if (existing) existing[1] = entry[1];
    else if (!history.length || history[history.length - 1][0] < entry[0]) history.push(entry);
  }
})();
