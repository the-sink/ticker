const yahooFinance = require("yahoo-finance");
const readline = require("readline");
const Enmap = require("enmap");
const chalk = require("chalk");
const data = new Enmap({name: "data"});

var running = true;

const aliases = {
  buy: "add",
  purchase: "add",
  check: "get",
  price: "get",
  current: "earnings",
  delete: "clear"
}

// eventually there should be command metadata to replace this and the dirty check on if a stock ticker needs to be specified
const help = `Available commands:
${chalk.bold("help")}: show this prompt
${chalk.bold("quit")}: exit the program
${chalk.bold("get <ticker>")}: get a current stock price
${chalk.bold("add <ticker> <quantity> <price>")}: add shares to your account
${chalk.bold("earnings <ticker>")}: get total earnings for stock
${chalk.bold("remove <ticker> <index>")}: remove index from share list, use "list" to see array indices
${chalk.bold("list <ticker>")}: list array indices for ticker, used for "remove" command
${chalk.bold("all")}: list all stock tickers currently on account
${chalk.bold("clear <ticker>")}: erase all shares of a stock from your account`

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
      console.log(`Current stock price of $${ticker}: ` + chalk.bold(`$${quote.price.regularMarketPrice}`));
    });
  },
  add: async function(response){
    var ticker = response[1].toUpperCase();
    var quantity = parseInt(response[2] || "1");
    var amount = response[3];
    await data.ensure(ticker, []);

    if (amount == null) {
      await yahooFinance.quote({
        symbol: ticker,
        modules: ["price"]
      }, function(err, quote) {
        amount = quote.price.regularMarketPrice;
      });
    }

    var stocks = await data.get(ticker);
    console.log(`You currently own ${stocks.length} stocks of $${ticker}, purchasing at ` + chalk.bold(`$${amount}`));

    for (var i = 0; i < quantity; i++) {
      stocks.push(amount);
    }

    await data.set(ticker, stocks);
  },
  earnings: async function(response){
    var ticker = response[1].toUpperCase();
    await data.ensure(ticker, []);
    var stocks = await data.get(ticker);
    var current = 0;
    var increaseTotal = 0;

    await yahooFinance.quote({
      symbol: ticker,
      modules: ["price"]
    }, function(err, quote) {
      current = quote.price.regularMarketPrice;
    });

    await stocks.forEach(function(value){
      increaseTotal += (current - value);
    });

    console.log(`Earnings total from this stock: ` + chalk.bold(`$${increaseTotal.toFixed(2)}`));
  },
  remove: async function(response){
    var ticker = response[1].toUpperCase();
    var index = parseInt(response[2]);

    await data.ensure(ticker, []);

    var stocks = await data.get(ticker);
    if (typeof stocks[index] !== "undefined"){
      stocks.splice(index, 1);
      await data.set(ticker, stocks);
      console.log(`Removed share #${index}`);
    } else {
      console.log(chalk.red(`That number doesn't exist! Run "list ${ticker}" for a list of currently owned shares and their index.`));
    }
  },
  list: async function(response){
    var ticker = response[1].toUpperCase();
    await data.ensure(ticker, []);

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
  }
}

const read = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function query(message) {
  return new Promise(resolve => read.question(message, answer => {
    resolve(answer);
  }));
}

async function main(){
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