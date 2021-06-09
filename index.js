// TODO: convert yahoo finance requests to a function

if (process.env.npm_package_version == undefined){
  console.error(`Please use \"npm start\"!`);
  process.exit();
}

const yahooFinance = require("yahoo-finance");
const readline = require("readline");
const Enmap = require("enmap");
const chalk = require("chalk");
const babar = require("babar");
const profile = process.argv[2] || "generic";
const data = new Enmap({name: profile});

var running = true;

const aliases = {
  buy: "add",
  purchase: "add",
  check: "get",
  price: "get",
  current: "earnings",
  delete: "clear",
  ls: "list",
  stocks: "all"
}

// (eventually there should be command metadata to replace this and the dirty check on if a stock ticker needs to be specified)
const help = `Available commands:
${chalk.bold("help")}: show this prompt
${chalk.bold("quit")}: exit the program (or just ctrl+c)
${chalk.bold("get <ticker>")}: get a current stock price
${chalk.bold("add <ticker> <quantity> <price>")}: add shares to your account
${chalk.bold("earnings <ticker>")}: get total earnings for stock, or use "*" in place of a stock ticker to get total earnings
${chalk.bold("remove <ticker> <index>")}: remove index from share list, use "list" to see array indices
${chalk.bold("list <ticker>")}: list array indices for ticker, used for "remove" command
${chalk.bold("all")}: list all stock tickers currently on account
${chalk.bold("clear <ticker>")}: erase all shares of a stock from your account
${chalk.bold("trend <ticker> <startDate> <endDate>")}: generate a trend graph for a stock in the given time period, endDate optionally accepts "today"`

// commands

const commands = {
  help: function(){
    console.log(help);
  },
  quit: function(){
    running = false;
  },
  get: async function(response){
    var ticker = response[1].toUpperCase();
    await yahooFinance.quote({
      symbol: ticker,
      modules: ["price"]
    }, function(err, quote) {
      if (err) return;
      var end = '';
      if (quote.price.quoteType != "EQUITY") {
        console.log(chalk.red(`$${ticker} is not equity, and cannot be listed!`));
        return;
      };
      if (quote.price.postMarketPrice != quote.price.regularMarketPrice) {
        end = `, after-market: ${chalk.bold(`$${quote.price.postMarketPrice}`)}`;
      }
      console.log(`Current stock price of $${ticker}: ${chalk.bold(`$${quote.price.regularMarketPrice}`)}` + end);
    }).catch(function(err){
      console.log(chalk.red(err));
    });
  },
  add: async function(response){
    var ticker = response[1].toUpperCase();
    var quantity = parseInt(response[2] || "1");
    var price = response[3];

    if (quantity < 1){
      console.log(chalk.red(`Cannot add less than one share of a stock! Quantity must be >= 1.`));
      return;
    }

    if (price == null) {
      await yahooFinance.quote({
        symbol: ticker,
        modules: ["price"]
      }, async function(err, quote) {
        if (err) return;
        if (quote.price.quoteType != "EQUITY") {
          console.log(chalk.red(`$${ticker} is not equity, and cannot be listed!`));
          return;
        };
        price = quote.price.regularMarketPrice;

        addShares(ticker, quantity, price);
      }).catch(function(err){
        console.log(chalk.red(err));
      });
    } else {
      addShares(ticker, quantity, price);
    }
  },
  earnings: async function(response){
    var ticker = response[1].toUpperCase();
    var increaseTotal = 0;
    var found = true;
    if (ticker == "*") {
      var tickers = await data.keyArray();
      console.log("Processing earnings for all stocks...");
      for (const subject of tickers){
        var earnings = await getEarnings(subject);
        increaseTotal += earnings;
      }
    } else {
      if (data.has(ticker)) {
        increaseTotal = await getEarnings(ticker);
      } else {
        found = false;
      }
    }

    if (!found) {
      console.log(chalk.red(`You don't have any shares of $${ticker}!`));
      return;
    }

    var output;
    if (increaseTotal > 0){
      output = chalk.green.bold(`$${increaseTotal.toFixed(2)}`)
    } else {
      output = chalk.red.bold(`$${increaseTotal.toFixed(2)}`)
    }

    console.log(`Earnings: ${output}`);
  },
  remove: async function(response){
    var ticker = response[1].toUpperCase();
    var index = parseInt(response[2]);

    if (!data.has(ticker)) {
      console.log(chalk.red(`You don't have any shares of $${ticker}!`));
      return;
    }

    var stocks = await data.get(ticker);
    if (typeof stocks[index] !== "undefined"){
      stocks.splice(index, 1);
      await data.set(ticker, stocks);
      console.log(`Removed share #${index}`);
    } else {
      console.log(chalk.red(`That number doesn't exist! Run "list ${ticker}" for a list of currently owned shares and their index. Or maybe you're looking for "clear"?`));
    }
  },
  list: async function(response){
    var ticker = response[1].toUpperCase();
    
    if (!data.has(ticker)) {
      console.log(chalk.red(`You don't have any shares of $${ticker}!`));
      return;
    }

    var stocks = await data.get(ticker);

    await stocks.forEach(function(value, index){
      console.log(chalk.bold(`#${index}`) + `: $${value}`);
    });
  },
  all: async function(){
    console.log(await data.keyArray());
  },
  clear: async function(response){
    var ticker = response[1].toUpperCase();
    console.log(`Clearing $${ticker} (if it exists)`);

    await data.delete(ticker);
  },
  trend: async function(response){
    var ticker = response[1].toUpperCase();
    var start = response[2];
    var end = response[3];
    if (end == "today"){end = new Date().toJSON().slice(0,10)};

    if (start == undefined || end == undefined) {
      console.log(chalk.red("Please provide a start and end date!"));
      return;
    }

    console.log(chalk.red("experimental: this command may not work as expected"));
    console.log(`price at days since ${start} and leading up to ${end}:`);

    await yahooFinance.historical({
      symbol: ticker,
      from: start,
      to: end,
    }, function (err, quotes) {
      if (err) return;
      var arr = [];
      quotes.forEach(function(data){
        arr.push([quotes.length-arr.length, data.close]);
      });
      console.log(babar(arr));
    }).catch(function(err){
      console.log(chalk.red(err));
    });
  }
}

// common functions and user input

const read = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function query(message) {
  return new Promise(resolve => read.question(message, answer => {
    resolve(answer);
  }));
}

async function addShares(ticker, quantity, price){
  await data.ensure(ticker, []);

  var stocks = await data.get(ticker);
  console.log(`You currently own ${stocks.length} stock(s) of $${ticker}, purchasing ${quantity} more at ` + chalk.bold(`$${price}`));

  for (var i = 0; i < quantity; i++) {
    stocks.push(price);
  }

  await data.set(ticker, stocks);
}

async function getEarnings(ticker) {
  var stocks = await data.get(ticker);
  var current = 0;
  var increaseTotal = 0;

  await yahooFinance.quote({
    symbol: ticker,
    modules: ["price"]
  }, function(err, quote) {
    if (err) return;
    current = quote.price.regularMarketPrice;
  }).catch(function(err){
    console.log(chalk.red(err));
  });

  await stocks.forEach(function(value){
    increaseTotal += (current - value);
  });
  return increaseTotal;
}

async function main(){
  console.log(`${chalk.blueBright("ticker")} ${process.env.npm_package_version} - using profile "${profile}" - run ${chalk.bold("help")} for a list of commands`)
  while (running) {
    var response = await query("> ");
    response = response.split(" ");
    var target = response[0].toLowerCase();
    if (commands[target] === undefined) {
      target = aliases[target];
    }
    if (target !== undefined) {
      if (target != "quit" && target != "all" && target != "help") { // god help me
        if (response[1] === undefined){
          console.log(chalk.red("Please specify a stock ticker!"));
          continue;
        }
      }
      process.stdin.pause();
      await commands[target](response);
      process.stdin.resume();
    } else {
      console.log(chalk.red("Invalid command!"));
    }
  }
  read.close();
  console.log("Goodbye!");
}

main();