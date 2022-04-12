const express = require("express");
const bodyParser = require('body-parser');
const ejs = require("ejs");
const https = require("https");
const mongoose = require("mongoose");
const CronJob = require('cron').CronJob;
const app = express();
const config = require("./apikey.js");

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static('public'));

var apikey = config.getApiKey();
var atlas = config.getAtlas();


mongoose.connect(atlas,{useNewUrlParser: true});


console.log('Before job instantiation');
const job = new CronJob('0 */10 * * * *', function() {
	const d = new Date();
	console.log('Every Tenth Minute:', d);
   mongoose.connection.db.dropCollection('rankers', function(err, result) {
    if(err){
      console.log(err);
    }else{
      console.log(result);
    }
  })
  const rankAPI = "https://na1.api.riotgames.com/lol/league-exp/v4/entries/RANKED_SOLO_5x5/CHALLENGER/I?page=1&api_key=" + apikey;
  var chunks2 = [];
  https.get(rankAPI, function(response5){
    response5.on("data", function(data5){
      chunks2.push(data5);
    })
    response5.on("end", function(){
      let chunk2 = Buffer.concat(chunks2);
      let rankerData = JSON.parse(chunk2);
      for(let i = 0; i < rankerData.length/2; i++){
        const ranker = new Ranker({
          Rank: i,
          SummonerName: rankerData[i].summonerName,
          Point: rankerData[i].leaguePoints,
          Win: rankerData[i].wins,
          Loss: rankerData[i].losses,
          Winrate: Math.floor((rankerData[i].wins/(rankerData[i].wins+ rankerData[i].losses)) * 100) + " %"
        })
        ranker.save();
      }
    })
  })

});
console.log('After job instantiation');
job.start();

app.get("/",function(req, res){
  res.render("index.ejs", );

})


var summoner = "";

app.post("/", function(req, res){
  summoner = req.body.summoner;
  res.redirect("/search/" + summoner)
})

var gameData_Total = [];
var errorCode = []

app.get('/search/:userId',function(req, res){
  console.log("----------- New Search ------------");
  gameData_Total.length = 0;
  errorCode.length = 0;
  summoner = req.params.userId;
  //Basic API to get api & puuid
  const defaultAPI = "https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/" +  summoner + "?api_key=" + apikey;
  //get information
  https.get(defaultAPI, function(response){
    console.log("Getting User Data: " + response.statusCode);
    if(response.statusCode !== 200){
      res.render("search_fail.ejs", {errorCode: response.statusCode});
    }else{
    response.on("data", function(data){
      //parse info
      const userDataDefault = JSON.parse(data);
      //get puuid
      const puuid = userDataDefault.puuid;
      //encryped id api for detailed info (ranks)
      const detailedAPI = "https://na1.api.riotgames.com/lol/league/v4/entries/by-summoner/" + userDataDefault.id + "?api_key=" + apikey;
      //api call for detailed info
      https.get(detailedAPI, function(response2){
        console.log("Getting User Detailed Data: " + response2.statusCode);
        if(response2.statusCode !== 200){
          res.render("search_fail.ejs", {errorCode: response2.statusCode});
        }else{
        response2.on("data", function(data2){
          //data called
          const userDataDetail = JSON.parse(data2);
          //image url (Player Icon)
        const imageURL = "http://ddragon.leagueoflegends.com/cdn/12.6.1/img/profileicon/" + userDataDefault.profileIconId + ".png";
        const matchesAPI = "https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/" + puuid + "/ids?start=0&count=20&api_key=" + apikey;
        https.get(matchesAPI, function(response3){
          console.log("Getting Match History List: " + response3.statusCode);
          if(response3.statusCode !== 200){
            res.render("search_fail.ejs", {errorCode: response3.statusCode});
          }else{
          response3.on("data", function(data3){
            const matchesData = JSON.parse(data3);
            console.log(matchesData);

            var interval = 150;

            matchesData.forEach(function(datum, index){
              // console.log(datum);
              var matchAPI = "https://americas.api.riotgames.com/lol/match/v5/matches/" + datum + "?api_key=" + apikey;
              // console.log(matchAPI);
              setTimeout(function(){
                dothis(matchAPI, summoner);
                // console.log(index);

              }, index*interval);
            })
            // if rank data for the current season does not exist
            setTimeout(function(){
              errorCode.forEach(function(code){
                if(code !== 200){
                  res.render("search_fail.ejs", {errorCode:code})
                }
              })
              gameData_Total.sort(function(a, b) {
                var keyA = new Date(a.gameEndTime),
                  keyB = new Date(b.gameEndTime);
                // Compare the 2 dates
                if (keyA > keyB) return -1;
                if (keyA < keyB) return 1;
                return 0;
              });

              if(data2.length < 300){
                //fill unranked data
                const imageURL2 = "/images/UNRANKED.png";
                res.render("search.ejs", {iconNumber: imageURL, summonerID: userDataDefault.name, summonerLevel: userDataDefault.summonerLevel, rankNumber: imageURL2, rank: "Unranked", win: "0", loss: "0", winrate: "0", matchList: gameData_Total});
              }else{
                //if exists, fill the ranked data information
                const winrate = ((userDataDetail[0].wins/(userDataDetail[0].wins + userDataDetail[0].losses))*100).toFixed();
                const imageURL2 = "/images/" + userDataDetail[0].tier + ".png";
                res.render("search.ejs", {iconNumber: imageURL, summonerID: userDataDefault.name, summonerLevel: userDataDefault.summonerLevel, rankNumber: imageURL2, rank: userDataDetail[0].tier + " " + userDataDetail[0].rank, win: userDataDetail[0].wins, loss: userDataDetail[0].losses, winrate: winrate, matchList: gameData_Total});
              }
              // console.log(gameData_Total[0]);

            }, 4000);
            // console.log(gameData_Total.length);

          })
        }
        })
      })
    }
    })
    })
  }
  })
})



function dothis(x, y){
  https.get(x, function(response4){
    let chunks = [];
    console.log("Getting Individual Match Detail: " + response4.statusCode);
    errorCode.push(response4.statusCode);
    if(response4.statusCode !== 200){
      return response4.statusCode;
    }else{
    response4.on("data", function(data4){
      chunks.push(data4);
    })
    response4.on("end", function(){
      let chunk = Buffer.concat(chunks);
      let matchData = JSON.parse(chunk);
      let matchType = "";
      // res.json(matchData);
      if(typeof(matchData.metadata) !== 'undefined'){
        if(matchData.info.queueId === 440){
          matchType = "Flex Ranked";
        }else if( matchData.info.queueId === 420){
          matchType = "Solo Ranked";
        }else if (matchData.info.queueId === 1020){
          matchType = "One For All";
        }else{
          matchType = "Others"
        }
        // console.log(matchData.info);
        // console.log((Date.now()));
        // console.log(matchData.info.gameEndTimestamp);
        var relativeTime = "";
        var tempRelativeTime = Math.floor((((Date.now() - matchData.info.gameEndTimestamp)/1000)/3600))
        // console.log(matchData.info);

        if(tempRelativeTime > 24){
          if ((tempRelativeTime/24) > 7){
            var relativeWeek = Math.floor((tempRelativeTime/24)/7);
            var relativeDay = Math.floor((tempRelativeTime/24) % 7);
            relativeTime = relativeWeek + " W " + relativeDay + " D ago" ;
          }else{
            var relativeDay = Math.floor(tempRelativeTime/24)
            relativeTime =  relativeDay + " D ago"
          }
        }else{
          relativeTime = tempRelativeTime + " H ago";
        }

        let gameData_Searched = {
          queueId: matchType,
          playTime_Minute: (Math.floor(matchData.info.gameDuration/60)), playTime_Second: (matchData.info.gameDuration%60),
          gameEndTime: matchData.info.gameEndTimestamp,
          gameEndRelative: relativeTime,
          champion: "",
          championLevel: 0,
          championId: matchData.info.championId,
          championURL: "",
          win: false,
          exist: false,
          players: []
        };



        matchData.info.participants.forEach(function(participant){

          let participantData = {
            summonerName: participant.summonerName,
            champion: participant.championName,
            championLevel: participant.champLevel,
            championURL: "https://ddragon.leagueoflegends.com/cdn/12.6.1/img/champion/" + participant.championName[0].toUpperCase() + participant.championName.substring(1) + ".png",
            win: participant.win,
            kill:participant.kills,
            death: participant.deaths,
            assist: participant.assists,
            searched: false
          };
          if(participantData.championURL === "https://ddragon.leagueoflegends.com/cdn/12.6.1/img/champion/FiddleSticks.png"){
            participantData.championURL = "https://ddragon.leagueoflegends.com/cdn/12.6.1/img/champion/Fiddlesticks.png"
            participantData.championName = "Fiddlesticks"
          }
          // if(participant.championName === "FiddleSticks"){
          //   participantData.championURL: "https://ddragon.leagueoflegends.com/cdn/12.6.1/img/champion/Fiddlesticks.png"
          // };

          if(participant.summonerName.toLowerCase() === y.toLowerCase()){
            gameData_Searched.champion = participant.championName;
            gameData_Searched.championLevel = participant.championLevel;
            gameData_Searched.championId = participant.championId;
            gameData_Searched.exist = true;
            gameData_Searched.championURL = participantData.championURL;
            participantData.searched = true;

            if(participant.win){
              gameData_Searched.win = true;
            }
          }
          gameData_Searched.players.push(participantData);
        })
        // console.log(gameData_Searched);
        gameData_Total.push(gameData_Searched);
        // console.log(gameData_Total);
        // console.log(matchData);
      }
    })
  }





  //   if(typeof(matchData) !== 'undefined'){
  //     if(typeof(matchData.info) !== 'undefined'){
  //   console.log(matchData.info.gameCreation)
  // }
  // };
  })
}

const rankerSchema = {
  Rank: {type: Number},
  SummonerName: {type:String},
  Point: {type: Number},
  Win: {type: Number},
  Loss: {type: Number},
  Winrate: {type: String}
}

const Ranker = mongoose.model("ranker", rankerSchema);

app.get("/ranking", function(req, res){
  Ranker.find({}).sort('Rank').exec(function(err, docs) {
    res.render("ranking.ejs", {rankers:docs});
  });
  // Ranker.find(function(err, rankers){
  //   if(err){
  //     console.log(err);
  //   }else{
  //     console.log(rankers);
  //   }
  // })

})



app.listen(3000, function(err){
  if(err){
    console.log(err);
  }else{
    console.log("Listening to port 3000");
  }
})
