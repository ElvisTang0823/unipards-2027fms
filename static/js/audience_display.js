// Copyright 2014 Team 254. All Rights Reserved.
// Author: pat@patfairbank.com (Patrick Fairbank)
// Author: nick@team254.com (Nick Eyre)
//
// Client-side methods for the audience display.

var websocket;
let transitionMap;
const transitionQueue = [];
let transitionInProgress = false;
let currentScreen = "blank";
let redSide;
let blueSide;
let currentMatch;
let overlayCenteringHideParams;
let overlayCenteringShowParams;
let bracketCarouselTimer = null;
let bracketCarouselIndex = 0;
const allianceSelectionTemplate = Handlebars.compile($("#allianceSelectionTemplate").html());
const sponsorImageTemplate = Handlebars.compile($("#sponsorImageTemplate").html());
const sponsorTextTemplate = Handlebars.compile($("#sponsorTextTemplate").html());

// Constants for overlay positioning. The CSS is the source of truth for the values that represent initial state.
const overlayCenteringTopUp = "-130px";
const overlayCenteringBottomHideParams = { queue: false, bottom: $("#overlayCentering").css("bottom") };
const overlayCenteringBottomShowParams = { queue: false, bottom: "0px" };
const overlayCenteringTopHideParams = { queue: false, top: overlayCenteringTopUp };
const overlayCenteringTopShowParams = { queue: false, top: "15px" };
//Match 介紹條高度
const eventMatchInfoDown = "35px";
const eventMatchInfoUp = $("#eventMatchInfo").css("height");
const logoUp = "0px";
const logoDown = $("#logo").css("top");
//score 動畫位置
const scoreIn = $(".score").css("width");
const scoreMid = "36vw";
const scoreOut = "36vw";

//比分數字位置
const scoreFieldsOut = "35vw";
const scoreLogoTop = "-500px";
const bracketLogoTop = "-780px";
const bracketLogoScale = 0.75;
const timeoutDetailsIn = $("#timeoutDetails").css("width");
const timeoutDetailsOut = "570px";

const numberIn = $(".score").css("width");
const numberOut = "30vw";

//過場動畫
let matchData = null;

// Handles a websocket message to change which screen is displayed.
const handleAudienceDisplayMode = function (targetScreen) {
  if (targetScreen === "bracket") {
    startBracketCarousel();
  } else {
    stopBracketCarousel();
  }
  // Coalesce repeated notifier messages while a transition is already running.
  if (transitionQueue[transitionQueue.length - 1] !== targetScreen) {
    transitionQueue.push(targetScreen);
  }
  executeTransitionQueue();
};

const showBracketCarouselSlide = function (index) {
  const slides = $("#bracket .audience-bracket-slide");
  if (slides.length === 0) {
    return;
  }
  bracketCarouselIndex = index % slides.length;
  slides.removeClass("is-active").attr("aria-hidden", "true");
  slides.eq(bracketCarouselIndex).addClass("is-active").attr("aria-hidden", "false");
};

const startBracketCarousel = function () {
  if (bracketCarouselTimer !== null) {
    clearInterval(bracketCarouselTimer);
  }
  showBracketCarouselSlide(0);
  bracketCarouselTimer = setInterval(function () {
    showBracketCarouselSlide(bracketCarouselIndex + 1);
  }, 9000);
};

const stopBracketCarousel = function () {
  if (bracketCarouselTimer !== null) {
    clearInterval(bracketCarouselTimer);
    bracketCarouselTimer = null;
  }
  showBracketCarouselSlide(0);
};

// Sequentially executes all transitions in the queue. Returns without doing anything if another invocation is already
// in progress.
const executeTransitionQueue = function () {
  if (transitionInProgress) {
    // There is an existing invocation of this method which will execute all transitions in the queue.
    return;
  }

  if (transitionQueue.length > 0) {
    transitionInProgress = true;
    const targetScreen = transitionQueue.shift();
    const callback = function () {
      // When the current transition is complete, call this method again to invoke the next one in the queue.
      currentScreen = targetScreen;
      transitionInProgress = false;
      setTimeout(executeTransitionQueue, 20);
    };

    if (targetScreen === currentScreen) {
      callback();
      return;
    }

    if (targetScreen === "sponsor") {
      initializeSponsorDisplay();
    }

    let transitions = transitionMap[currentScreen][targetScreen];
    if (transitions !== undefined) {
      transitions(callback);
    } else {
      // There is no direct transition defined; need to go to the blank screen first.
      transitionMap[currentScreen]["blank"](function () {
        transitionMap["blank"][targetScreen](callback);
      });
    }
  }
};

// Handles a websocket message to update the teams for the current match.
const handleMatchLoad = function (data) {
  currentMatch = data.Match;
  $("body").attr("data-playoff", currentMatch.Type === matchTypePlayoff ? "true" : "false");
  $(`#${redSide}Team1`).text(currentMatch.Red1);
  $(`#${redSide}Team1`).attr("data-yellow-card", data.Teams["R1"]?.YellowCard);
  $(`#${redSide}Team2`).text(currentMatch.Red2);
  $(`#${redSide}Team2`).attr("data-yellow-card", data.Teams["R2"]?.YellowCard);
  $(`#${redSide}Team3`).text(currentMatch.Red3);
  $(`#${redSide}Team3`).attr("data-yellow-card", data.Teams["R3"]?.YellowCard);
  $(`#${redSide}Team1Avatar`).attr("src", getAvatarUrl(currentMatch.Red1));
  $(`#${redSide}Team2Avatar`).attr("src", getAvatarUrl(currentMatch.Red2));
  $(`#${redSide}Team3Avatar`).attr("src", getAvatarUrl(currentMatch.Red3));
  $(`#${blueSide}Team1`).text(currentMatch.Blue1);
  $(`#${blueSide}Team1`).attr("data-yellow-card", data.Teams["B1"]?.YellowCard);
  $(`#${blueSide}Team2`).text(currentMatch.Blue2);
  $(`#${blueSide}Team2`).attr("data-yellow-card", data.Teams["B2"]?.YellowCard);
  $(`#${blueSide}Team3`).text(currentMatch.Blue3);
  $(`#${blueSide}Team3`).attr("data-yellow-card", data.Teams["B3"]?.YellowCard);
  $(`#${blueSide}Team1Avatar`).attr("src", getAvatarUrl(currentMatch.Blue1));
  $(`#${blueSide}Team2Avatar`).attr("src", getAvatarUrl(currentMatch.Blue2));
  $(`#${blueSide}Team3Avatar`).attr("src", getAvatarUrl(currentMatch.Blue3));

  // Show alliance numbers if this is a playoff match.
  if (currentMatch.Type === matchTypePlayoff) {
    $(`#${redSide}PlayoffAlliance`).text(currentMatch.PlayoffRedAlliance);
    $(`#${blueSide}PlayoffAlliance`).text(currentMatch.PlayoffBlueAlliance);
    $(".playoff-alliance").show();

    // Show the series status if this playoff round isn't just a single match.
    if (data.Matchup.NumWinsToAdvance > 1) {
      $(`#${redSide}PlayoffAllianceWins`).text(data.Matchup.RedAllianceWins);
      $(`#${blueSide}PlayoffAllianceWins`).text(data.Matchup.BlueAllianceWins);
      $("#playoffSeriesStatus").css("display", "flex");
    } else {
      $("#playoffSeriesStatus").hide();
    }
  } else {
    $(`#${redSide}PlayoffAlliance`).text("");
    $(`#${blueSide}PlayoffAlliance`).text("");
    $(".playoff-alliance").hide();
    $("#playoffSeriesStatus").hide();
  }

  let matchName = data.Match.LongName;
  if (data.Match.NameDetail !== "") {
    matchName += " &ndash; " + data.Match.NameDetail;
  }
  $("#matchName").html(matchName);
  $("#timeoutNextMatchName").html(matchName);
  $("#timeoutBreakDescription").text(data.BreakDescription);
};

// Handles a websocket message to update the match time countdown.
const handleMatchTime = function (data) {
  translateMatchTime(data, function (matchState, matchStateText, countdownSec) {
    $("body").attr("data-match-state", matchState);
    $("#matchTime").text(matchState === "POST_MATCH" ? "0:00" : getCountdownString(countdownSec));
  });

  // Place the active-Hub arrow on the physical side where that alliance is displayed.
  const setHubActive = function (side, active) {
    const element = $(`#${side}_Hubactive`);
    const matchInProgress = [3, 4, 5].includes(data.MatchState);
    if (!matchInProgress || !active) {
      element.empty();
      return;
    }
    element.html(
      `<img class="hub-active-arrow" src="/static/img/hubactive_${side}.png" alt="Active Hub">`
    );
  };
  setHubActive(redSide, data.HubActiveRed === true);
  setHubActive(blueSide, data.HubActiveBlue === true);

  // The official layout shows the shift row only during Teleop.
  const isTeleop = data.MatchState === 5;
  $("#shiftCounter, #shiftTime").toggle(isTeleop);
  if (isTeleop) {
    $("#currentShift").text(data.CurrentShift);
    $("#shiftTime").text(`:${String(data.ShiftTimeSec).padStart(2, "0")}`);
  }
};

// Handles a websocket message to update the match score.
const handleRealtimeScore = function (data) {
  $(`#${redSide}ScoreNumber`).text(data.Red.ScoreSummary.Score);
  $(`#${blueSide}ScoreNumber`).text(data.Blue.ScoreSummary.Score);
  let redCoral;
  let blueCoral;

  // Show progress toward the first unmet Fuel RP: 360 first, then 500.
  const getFuelGoal = (summary) => summary.EnergizedRankingPoint
    ? data.SuperchargedFuelThreshold
    : data.EnergizedFuelThreshold;

  if (currentMatch.Type === matchTypePlayoff) {
    redCoral = data.Red.ScoreSummary.TotalFuelPoints;
    blueCoral = data.Blue.ScoreSummary.TotalFuelPoints;
  } else {
    const redFuelGoal = getFuelGoal(data.Red.ScoreSummary);
    const blueFuelGoal = getFuelGoal(data.Blue.ScoreSummary);
    redCoral = `${data.Red.ScoreSummary.TotalFuelPoints} / ${redFuelGoal}`;
    blueCoral = `${data.Blue.ScoreSummary.TotalFuelPoints} / ${blueFuelGoal}`;
  }
  $(`#${redSide}Coral`).text(redCoral);
  $(`#${redSide}Algae`).text(data.Red.ScoreSummary.TotalTowerPoints);
  $(`#${blueSide}Coral`).text(blueCoral);
  $(`#${blueSide}Algae`).text(data.Blue.ScoreSummary.TotalTowerPoints);

};

//撥放勝利影片
function playWinVideo(callback, data) {
  const videoPlayer = document.getElementById("winVideoPlayer");
  const videoSource = document.getElementById("winVideoSource");

  if (!data) {
    console.warn("⚠️ 無法播放影片：data 為 null");
    callback();
    return;
  }

  // 先移除任何 onended（避免重複綁定）
  videoPlayer.onended = null;
  videoPlayer.pause();
  videoPlayer.currentTime = 0;

  // 重新設定 source
  let videoFile = "";
  if (data.RedWon && !data.BlueWon) {
    videoFile = "/static/video/RedWinsVideo.mp4";
  } else if (!data.RedWon && data.BlueWon) {
    videoFile = "/static/video/BlueWinsVideo.mp4";
  } else {
    videoFile = "/static/video/TieVideo.mp4";
  }

  videoSource.src = videoFile;
  videoPlayer.load();

  // 顯示並準備播放
  videoPlayer.style.display = "block";
  videoPlayer.muted = false;

  videoPlayer.onended = () => {
    console.log("✅ 影片播放結束");
    videoPlayer.style.display = "none";
    callback();
  };

  videoPlayer.play()
    .then(() => console.log("✅ 播放成功"))
    .catch((e) => {
      console.error("❌ 播放失敗:", e);
      videoPlayer.style.display = "none";
      callback();
    });
}

//final 計分畫面
// Handles a websocket message to populate the final score data.
const handleScorePosted = function (data) {
  matchData = data;
  $(`#${redSide}FinalScore`).text(data.RedScoreSummary.Score);
  $(`#${redSide}FinalAlliance`).text("Alliance " + data.Match.PlayoffRedAlliance);
  setTeamInfo(redSide, 1, data.Match.Red1, data.RedCards, data.RedRankings);
  setTeamInfo(redSide, 2, data.Match.Red2, data.RedCards, data.RedRankings);
  setTeamInfo(redSide, 3, data.Match.Red3, data.RedCards, data.RedRankings);
  if (data.RedOffFieldTeamIds.length > 0) {
    setTeamInfo(redSide, 4, data.RedOffFieldTeamIds[0], data.RedCards, data.RedRankings);
  } else {
    setTeamInfo(redSide, 4, 0, data.RedCards, data.RedRankings);
  }
  $(`#${redSide}FinalLeavePoints`).text(data.RedScoreSummary.AutoFuelPoints);
  $(`#${redSide}FinalCoralPoints`).text(data.RedScoreSummary.AutoTowerPoints);
  $(`#${redSide}FinalAlgaePoints`).text(data.RedScoreSummary.TeleopFuelPoints);
  $(`#${redSide}FinalBargePoints`).text(data.RedScoreSummary.EndgameTowerPoints);
  $(`#${redSide}FinalFoulPoints`).text(data.RedScoreSummary.FoulPoints);
  $(`#${redSide}FinalAutoBonusRankingPoint`).html(
    data.RedScoreSummary.EnergizedRankingPoint ? '<img src="/static/img/red_energizedRP.png" alt="✔" style="width:60px;height:60px;margin:20px 5px;">' : ' '
  );
  $(`#${redSide}FinalAutoBonusRankingPoint`).attr(
    "data-checked", data.RedScoreSummary.EnergizedRankingPoint
  );
  $(`#${redSide}FinalCoralBonusRankingPoint`).html(
    data.RedScoreSummary.SuperchargedRankingPoint ? '<img src="/static/img/red_superRP.png" alt="✔" style="width:60px;height:60px;margin:20px 5px;">' : " "
  );
  $(`#${redSide}FinalCoralBonusRankingPoint`).attr(
    "data-checked", data.RedScoreSummary.SuperchargedRankingPoint
  );
  $(`#${redSide}FinalBargeBonusRankingPoint`).html(
    data.RedScoreSummary.TraversalRankingPoint ? '<img src="/static/img/red_towerRP.png" alt="✔" style="width:60px;height:60px;margin:20px 5px;">' : " "
  );
  $(`#${redSide}FinalBargeBonusRankingPoint`).attr(
    "data-checked", data.RedScoreSummary.TraversalRankingPoint
  );
  $(`#${redSide}FinalRankingPoints`).html(data.RedRankingPoints);
  $(`#${redSide}FinalWins`).text(data.RedWins);
  const redFinalDestination = $(`#${redSide}FinalDestination`);
  redFinalDestination.html(data.RedDestination.replace("Advances to ", "Advances to<br>"));
  redFinalDestination.toggle(data.RedDestination !== "");
  redFinalDestination.attr("data-won", data.RedWon);
  let redimgHtml = " ";
  for (let i = 0; i < data.RedWinRP; i++) {
    redimgHtml += '<img src="/static/img/red_winRP.png" style="width:60px;height:60px;margin:20px 5px;">';
  }
  $(`#${redSide}FinalRankingPoints`).html(redimgHtml);



  $(`#${blueSide}FinalScore`).text(data.BlueScoreSummary.Score);
  $(`#${blueSide}FinalAlliance`).text("Alliance " + data.Match.PlayoffBlueAlliance);
  setTeamInfo(blueSide, 1, data.Match.Blue1, data.BlueCards, data.BlueRankings);
  setTeamInfo(blueSide, 2, data.Match.Blue2, data.BlueCards, data.BlueRankings);
  setTeamInfo(blueSide, 3, data.Match.Blue3, data.BlueCards, data.BlueRankings);
  if (data.BlueOffFieldTeamIds.length > 0) {
    setTeamInfo(blueSide, 4, data.BlueOffFieldTeamIds[0], data.BlueCards, data.BlueRankings);
  } else {
    setTeamInfo(blueSide, 4, 0, data.BlueCards, data.BlueRankings);
  }
  $(`#${blueSide}FinalLeavePoints`).text(data.BlueScoreSummary.AutoFuelPoints);
  $(`#${blueSide}FinalCoralPoints`).text(data.BlueScoreSummary.AutoTowerPoints);
  $(`#${blueSide}FinalAlgaePoints`).text(data.BlueScoreSummary.TeleopFuelPoints);
  $(`#${blueSide}FinalBargePoints`).text(data.BlueScoreSummary.EndgameTowerPoints);
  $(`#${blueSide}FinalFoulPoints`).text(data.BlueScoreSummary.FoulPoints);
  $(`#${blueSide}FinalAutoBonusRankingPoint`).html(
    data.BlueScoreSummary.EnergizedRankingPoint ? '<img src="/static/img/blue_energizedRP.png" alt="✔" style="width:60px;height:60px;margin:20px 5px;">' : " "
  );
  $(`#${blueSide}FinalAutoBonusRankingPoint`).attr(
    "data-checked", data.BlueScoreSummary.EnergizedRankingPoint
  );
  $(`#${blueSide}FinalCoralBonusRankingPoint`).html(
    data.BlueScoreSummary.SuperchargedRankingPoint ? '<img src="/static/img/blue_superRP.png" alt="✔" style="width:60px;height:60px;margin:20px 5px;">' : " "
  );
  $(`#${blueSide}FinalCoralBonusRankingPoint`).attr(
    "data-checked", data.BlueScoreSummary.SuperchargedRankingPoint
  );
  $(`#${blueSide}FinalBargeBonusRankingPoint`).html(
    data.BlueScoreSummary.TraversalRankingPoint ? '<img src="/static/img/blue_towerRP.png" alt="✔" style="width:60px;height:60px;margin:20px 5px;">' : " "
  );
  $(`#${blueSide}FinalBargeBonusRankingPoint`).attr(
    "data-checked", data.BlueScoreSummary.TraversalRankingPoint
  );
  $(`#${blueSide}FinalRankingPoints`).html(data.BlueRankingPoints);
  $(`#${blueSide}FinalWins`).text(data.BlueWins);
  const blueFinalDestination = $(`#${blueSide}FinalDestination`);
  blueFinalDestination.html(data.BlueDestination.replace("Advances to ", "Advances to<br>"));
  blueFinalDestination.toggle(data.BlueDestination !== "");
  blueFinalDestination.attr("data-won", data.BlueWon);
  let blueimgHtml = " ";
  for (let i = 0; i < data.BlueWinRP; i++) {
    blueimgHtml += '<img src="/static/img/blue_winRP.png" style="width:60px;height:60px;margin:20px 5px;">';
  }
  $(`#${blueSide}FinalRankingPoints`).html(blueimgHtml);

  let matchName = data.Match.LongName;
  if (data.Match.NameDetail !== "") {
    matchName += " &ndash; " + data.Match.NameDetail;
  }
  $("#finalMatchName").html(matchName);

  // Reload the bracket to reflect any changes.
  $("#bracketSvg").attr(
    "src",
    "/api/bracket/svg?style=audience&activeMatch=saved&v=" + new Date().getTime(),
  );

  if (data.Match.Type === matchTypePlayoff) {
    // Hide bonus ranking points and show playoff-only fields.
    $(".playoff-hidden-field").hide();
    $(".playoff-only-field").show();
  } else {
    $(".playoff-hidden-field").show();
    $(".playoff-only-field").hide();
  }
};

// Handles a websocket message to play a sound to signal match start/stop/etc.
const handlePlaySound = function (sound) {
  $("audio").each(function (k, v) {
    // Stop and reset any sounds that are still playing.
    v.pause();
    v.currentTime = 0;
  });
  $("#sound-" + sound)[0].play();
};

// Handles a websocket message to update the alliance selection screen.
const handleAllianceSelection = function (data) {
  const alliances = data.Alliances;
  const rankedTeams = data.RankedTeams;
  if (alliances && alliances.length > 0) {
    const numColumns = alliances[0].TeamIds.length + 1;
    $.each(alliances, function (k, v) {
      v.Index = k + 1;
    });
    $("#allianceSelection").html(allianceSelectionTemplate({ alliances: alliances, numColumns: numColumns }));

    let bracketAllianceHtml = "";
    for (let i = 0; i < 8; i++) {
      const teamIds = alliances[i] ? alliances[i].TeamIds.slice(0, 3) : [];
      while (teamIds.length < 3) {
        teamIds.push(0);
      }
      const teamCells = teamIds.map(function (teamId) {
        if (teamId > 0) {
          return `<div class="bracket-alliance-team">` +
            `<img src="${getAvatarUrl(teamId)}" alt="Team ${teamId}">` +
            `<span>${teamId}</span>` +
            `</div>`;
        }
        return `<div class="bracket-alliance-team bracket-alliance-team-empty">` +
          `<img src="/static/img/lower-third-logo.png" alt="Team pending">` +
          `</div>`;
      }).join("");
      bracketAllianceHtml += `<div class="bracket-alliance-row">` +
        `<div class="bracket-alliance-label">Alliance ${i + 1}</div>` +
        `<div class="bracket-alliance-teams">${teamCells}</div>` +
        `</div>`;
    }
    $("#bracketAllianceGrid").html(bracketAllianceHtml);
  }
  if (rankedTeams) {
    // Count remaining captain slots
    let captainSlotsRemaining = 0;
    if (alliances) {
      $.each(alliances, function (k, v) {
        if (v.TeamIds[0] === 0) {
          captainSlotsRemaining++;
        }
      });
    }

    let text = "";
    let unpickedCount = 0;
    $.each(rankedTeams, function (i, v) {
      if (unpickedCount >= 20) {
        return false;
      }
      if (!v.Picked) {
        let isCaptain = unpickedCount < captainSlotsRemaining;
        let tileClass = isCaptain ? "team-tile-display captain-candidate" : "team-tile-display";

        text += `<div class="${tileClass}">` +
          `<div class="team-rank-display">${v.Rank}</div>` +
          `<div class="team-body-display">${v.TeamId}</div>` +
          `</div>`;
        unpickedCount++;
      }
    });
    $("#allianceRankings").html(text);
    if (unpickedCount === 0) {
      $("#allianceRankingsCentering").addClass("empty-grid");
    } else {
      $("#allianceRankingsCentering").removeClass("empty-grid");
    }
  }

  if (data.ShowTimer) {
    $("#allianceSelectionTimer").text(getCountdownString(data.TimeRemainingSec));
    $("#allianceTimerBox").show();
  } else {
    $("#allianceTimerBox").hide();
  }
};

// Handles a websocket message to populate and/or show/hide a lower third.
const handleLowerThird = function (data) {
  if (data.LowerThird !== null) {
    
    $("#lowerThirdSingle").hide();

    $("#lowerThirdTitle").text(data.LowerThird.TopText);
    $("#lowerThirdTop").show();

    
    const bottomText = data.LowerThird.BottomText ? data.LowerThird.BottomText.trim() : "";
    const lowerThirdBottomElement = $("#lowerThirdBottom");

    if (bottomText !== "" && data.ShowLowerThirdTeam) {
      
      if (bottomText.includes("|")) {
        const parts = bottomText.split("|");
        $("#lowerThirdTeamNumber").text(parts[0].trim());
        $("#lowerThirdTeamName").text(parts[1].trim());
      } else {
        // 沒有 '|' 符號時，清空隊號，直接將文字顯示在隊名欄位
        $("#lowerThirdTeamNumber").text("");
        $("#lowerThirdTeamName").text(bottomText);
      }
      
      // 滑出第二條（如果目前是隱藏的才觸發，避免重複播放動畫）
      if (!lowerThirdBottomElement.is(":visible")) {
        lowerThirdBottomElement.slideDown(400);
      }
    } else {
      // BottomText 為空、或還沒按下「顯示得獎隊伍」時，滑入收起第二條
      if (lowerThirdBottomElement.is(":visible")) {
        lowerThirdBottomElement.slideUp(400);
      }
    }
  }

  // 3. 左側滑入/滑出動畫邏輯
  const lowerThirdElement = $("#lowerThird");
  if (data.ShowLowerThird && !lowerThirdElement.is(":visible")) {
    lowerThirdElement.show();
    lowerThirdElement.transition({ queue: false, left: "150px" }, 750, "ease");
  } else if (!data.ShowLowerThird && lowerThirdElement.is(":visible")) {
    lowerThirdElement.transition({ queue: false, left: "-1000px" }, 1000, "ease", function () {
      lowerThirdElement.hide();
    });
  }
};
const transitionAllianceSelectionToBlank = function (callback) {
  $('#allianceSelectionBackground').hide();
  $('#allianceSelectionCentering').transition({ queue: false, right: "-60em" }, 500, "ease", callback);
  $('#allianceRankingsCentering.enabled').transition({ queue: false, left: "-60em" }, 500, "ease");
};

const transitionBlankToAllianceSelection = function (callback) {
  $('#allianceSelectionBackground').show();
  $('#allianceSelectionCentering').css("right", "-60em").show();
  $('#allianceSelectionCentering').transition({ queue: false, right: "4em" }, 500, "ease", callback);
  $('#allianceRankingsCentering.enabled').css("left", "-60em").show();
  $('#allianceRankingsCentering.enabled').transition({ queue: false, left: "4em" }, 500, "ease");
};

const transitionBlankToBracket = function (callback) {
  transitionBlankToLogo(function () {
    setTimeout(function () { transitionLogoToBracket(callback); }, 50);
  });
};

const transitionBlankToIntro = function (callback) {
  $("#broadcastFooter").hide();
  $(".teams").css({ display: "flex", opacity: 1 });
  $(".avatars").css({ display: "flex", opacity: 1 });
  $("#left_Hubactive, #right_Hubactive").hide();
  if (currentMatch?.Type === matchTypePlayoff) {
    $(".score-fields").css({ display: "flex", opacity: 1 });
    $(".score-number, #matchTime").css("opacity", 1);
  } else {
    $(".score-number, #matchTime, .score-fields").css("opacity", 0);
  }
  $("#eventMatchInfo").css({ display: "grid", height: eventMatchInfoDown });
  $("#overlayCentering")
    .css({ top: overlayCenteringTopUp, opacity: 0 })
    .transition(
      { queue: false, top: overlayCenteringTopShowParams.top, opacity: 1 },
      420,
      "ease",
      callback,
    );
};

const transitionBlankToLogo = function (callback) {
  $(".blindsCenter.blank").css({ rotateY: "0deg" });
  $(".blindsCenter.full").css({ rotateY: "-180deg" });
  $(".blinds.right").transition({ queue: false, right: 0 }, 1000, "ease");
  $(".blinds.left").transition({ queue: false, left: 0 }, 1000, "ease", function () {
    $(".blinds.left").addClass("full");
    $(".blinds.right").hide();
    setTimeout(function () {
      $(".blindsCenter.blank").transition({ queue: false, rotateY: "180deg" }, 500, "ease");
      $(".blindsCenter.full").transition({ queue: false, rotateY: "0deg" }, 500, "ease", callback);
    }, 200);
  });
};

const transitionBlankToLogoLuma = function (callback) {
  $(".blindsCenter.blank").css({ rotateY: "180deg" });
  $(".blindsCenter.full").transition({ queue: false, rotateY: "0deg" }, 1000, "ease", callback);
};

const transitionBlankToMatch = function (callback) {
  $(".teams").css({ display: "flex", opacity: 1 });
  $("#left_Hubactive, #right_Hubactive").show().css("opacity", 1);
  $(".score-fields").css({ display: "flex", opacity: 1 });
  $(".score-number, #matchTime").css("opacity", 1);
  $("#eventMatchInfo").css({ display: "grid", height: eventMatchInfoDown });
  $("#broadcastFooter").css({ display: "flex", opacity: 0 });
  $("#broadcastFooter").transition({ queue: false, opacity: 1 }, 320, "ease");

  $("#overlayCentering")
    .css({ top: overlayCenteringTopUp, opacity: 0 })
    .transition(
      { queue: false, top: overlayCenteringTopShowParams.top, opacity: 1 },
      420,
      "ease",
      callback,
    );
};

const transitionBlankToScore = function (callback) {
// 先撥放勝利影片（playWinVideo 為你已有的函式）
  playWinVideo(function () {
    // 影片播放完後再執行 transitionBlankToLogo → transitionLogoToScore
    transitionBlankToLogo(function () {
      setTimeout(function () { transitionLogoToScore(callback); }, 50);
    });
  }, matchData); // matchData 是從 scorePosted 拿到的資料
};

const transitionBlankToSponsor = function (callback) {
  $(".blindsCenter.blank").css({ rotateY: "90deg" });
  $(".blinds.right").transition({ queue: false, right: 0 }, 1000, "ease");
  $(".blinds.left").transition({ queue: false, left: 0 }, 1000, "ease", function () {
    $(".blinds.left").addClass("full");
    $(".blinds.right").hide();
    setTimeout(function () {
      $("#sponsor").show();
      $("#sponsor").transition({ queue: false, opacity: 1 }, 1000, "ease", callback);
    }, 200);
  });
};

const transitionBlankToTimeout = function (callback) {
  $("#overlayCentering").transition(overlayCenteringShowParams, 500, "ease", function () {
    $("#timeoutDetails").transition({ queue: false, width: timeoutDetailsOut }, 500, "ease");
    $("#logo").transition({ queue: false, top: logoUp }, 500, "ease", function () {
      $(".timeout-detail").transition({ queue: false, opacity: 1 }, 750, "ease");
      $("#matchTime").transition({ queue: false, opacity: 1 }, 750, "ease", callback);
    });
  });
};

const transitionBracketToBlank = function (callback) {
  transitionBracketToLogo(function () {
    transitionLogoToBlank(callback);
  });
};

const transitionBracketToLogo = function (callback) {
  $("#bracket").transition({ queue: false, opacity: 0 }, 500, "ease", function () {
    $("#bracket").hide();
  });
  $(".blindsCenter.full").transition({ queue: false, top: 0, scale: 1 }, 625, "ease", callback);
};

const transitionBracketToLogoLuma = function (callback) {
  transitionBracketToLogo(function () {
    transitionLogoToLogoLuma(callback);
  });
};

const transitionBracketToScore = function (callback) {
  $(".blindsCenter.full").transition({ queue: false, top: scoreLogoTop, scale: 1 }, 1000, "ease");
  $("#bracket").transition({ queue: false, opacity: 0 }, 1000, "ease", function () {
    $("#bracket").hide();
    $("#finalScore").show();
    $("#finalScore").transition({ queue: false, opacity: 1 }, 1000, "ease", callback);
  });
};

const transitionBracketToSponsor = function (callback) {
  transitionBracketToLogo(function () {
    transitionLogoToSponsor(callback);
  });
};

const transitionIntroToBlank = function (callback) {
  $("#overlayCentering").transition(
    { queue: false, top: overlayCenteringTopUp, opacity: 0 },
    380,
    "ease",
    function () {
      $(".avatars, .teams, #eventMatchInfo").hide();
      $("#overlayCentering").css("opacity", 1);
      callback();
    },
  );
};

const transitionIntroToMatch = function (callback) {
  $("#left_Hubactive, #right_Hubactive").show().css("opacity", 1);
  if (currentMatch?.Type !== matchTypePlayoff) {
    $(".avatars").transition({ queue: false, opacity: 0 }, 250, "ease", function () {
      $(this).hide();
    });
  }
  $(".score-fields").css("display", "flex");
  $("#broadcastFooter").css({ display: "flex", opacity: 0 });
  $("#broadcastFooter").transition({ queue: false, opacity: 1 }, 300, "ease");
  $(".score-number, #matchTime, .score-fields").transition(
    { queue: false, opacity: 1 },
    350,
    "ease",
  );
  setTimeout(callback, 350);
};

const transitionIntroToTimeout = function (callback) {
  $("#eventMatchInfo").transition({ queue: false, height: eventMatchInfoUp }, 500, "ease", function () {
    $("#eventMatchInfo").hide();
    $(".score").transition({ queue: false, width: scoreIn }, 500, "ease", function () {
      $(".avatars").css("opacity", 0);
      $(".avatars").hide();
      $(".teams").hide();
      $("#timeoutDetails").transition({ queue: false, width: timeoutDetailsOut }, 500, "ease");
      $("#logo").transition({ queue: false, top: logoUp }, 500, "ease", function () {
        $(".timeout-detail").transition({ queue: false, opacity: 1 }, 750, "ease");
        $("#matchTime").transition({ queue: false, opacity: 1 }, 750, "ease", callback);
      });
    });
  });
};

const transitionLogoToBlank = function (callback) {
  $(".blindsCenter.blank").transition({ queue: false, rotateY: "360deg" }, 500, "ease");
  $(".blindsCenter.full").transition({ queue: false, rotateY: "180deg" }, 500, "ease", function () {
    setTimeout(function () {
      $(".blinds.left").removeClass("full");
      $(".blinds.right").show();
      $(".blinds.right").transition({ queue: false, right: "-50%" }, 1000, "ease");
      $(".blinds.left").transition({ queue: false, left: "-50%" }, 1000, "ease", callback);
    }, 200);
  });
};

const transitionLogoToBracket = function (callback) {
  $(".blindsCenter.full").transition({ queue: false, top: bracketLogoTop, scale: bracketLogoScale }, 625, "ease");
  $("#bracket").show();
  $("#bracket").transition({ queue: false, opacity: 1 }, 1000, "ease", callback);
};

const transitionLogoToLogoLuma = function (callback) {
  $(".blinds.left").removeClass("full");
  $(".blinds.right").show();
  $(".blinds.right").transition({ queue: false, right: "-50%" }, 1000, "ease");
  $(".blinds.left").transition({ queue: false, left: "-50%" }, 1000, "ease", function () {
    if (callback) {
      callback();
    }
  });
};

const transitionLogoToScore = function (callback) {
  $(".blindsCenter.full").transition({ queue: false, top: scoreLogoTop }, 625, "ease");

  $("#finalScore").show();
  $("#finalScore").transition({ queue: false, opacity: 1 }, 1000, "ease", callback);
};

const transitionLogoToSponsor = function (callback) {
  $(".blindsCenter.full").transition({ queue: false, rotateY: "90deg" }, 750, "ease", function () {
    $("#sponsor").show();
    $("#sponsor").transition({ queue: false, opacity: 1 }, 1000, "ease", callback);
  });
};

const transitionLogoLumaToBlank = function (callback) {
  $(".blindsCenter.full").transition({ queue: false, rotateY: "180deg" }, 1000, "ease", callback);
};

const transitionLogoLumaToBracket = function (callback) {
  transitionLogoLumaToLogo(function () {
    transitionLogoToBracket(callback);
  });
};

const transitionLogoLumaToLogo = function (callback) {
  $(".blinds.right").transition({ queue: false, right: 0 }, 1000, "ease");
  $(".blinds.left").transition({ queue: false, left: 0 }, 1000, "ease", function () {
    $(".blinds.left").addClass("full");
    $(".blinds.right").hide();
    if (callback) {
      callback();
    }
  });
};

const transitionLogoLumaToScore = function (callback) {
  transitionLogoLumaToLogo(function () {
    transitionLogoToScore(callback);
  });
};

const transitionMatchToBlank = function (callback) {
  $("#broadcastFooter").transition({ queue: false, opacity: 0 }, 280, "ease");
  $("#overlayCentering").transition(
    { queue: false, top: overlayCenteringTopUp, opacity: 0 },
    400,
    "ease",
    function () {
      $(".teams, .score-fields, #eventMatchInfo").hide();
      $("#broadcastFooter").hide().css("opacity", 1);
      $(".score-number, #matchTime, .score-fields").css("opacity", 1);
      $("#overlayCentering").css("opacity", 1);
      callback();
    },
  );
};

const transitionMatchToIntro = function (callback) {
  $("#left_Hubactive, #right_Hubactive").transition({ queue: false, opacity: 0 }, 220, "ease", function () {
    $(this).hide().css("opacity", 1);
  });
  $("#broadcastFooter").transition({ queue: false, opacity: 0 }, 250, "ease", function () {
    $(this).hide().css("opacity", 1);
  });
  if (currentMatch?.Type === matchTypePlayoff) {
    $(".score-number, #matchTime, .score-fields").css("opacity", 1);
    $(".score-fields").css("display", "flex");
  } else {
    $(".score-number, #matchTime, .score-fields").transition(
      { queue: false, opacity: 0 },
      280,
      "ease",
      function () {
        $(".score-fields").hide();
        $(".avatars").css({ display: "flex", opacity: 0 });
        $(".avatars").transition({ queue: false, opacity: 1 }, 280, "ease");
      },
    );
  }
  setTimeout(callback, 300);
};

const transitionScoreToBlank = function (callback) {
  transitionScoreToLogo(function () {
    transitionLogoToBlank(callback);
  });
};

const transitionScoreToBracket = function (callback) {
  $(".blindsCenter.full").transition({ queue: false, top: bracketLogoTop, scale: bracketLogoScale }, 1000, "ease");
  $("#finalScore").transition({ queue: false, opacity: 0 }, 1000, "ease", function () {
    $("#finalScore").hide();
    $("#bracket").show();
    $("#bracket").transition({ queue: false, opacity: 1 }, 1000, "ease", callback);
  });
};

const transitionScoreToLogo = function (callback) {
  $("#finalScore").transition({ queue: false, opacity: 0 }, 500, "ease", function () {
    $("#finalScore").hide();
  });
  $(".blindsCenter.full").transition({ queue: false, top: 0 }, 625, "ease", callback);
};

const transitionScoreToLogoLuma = function (callback) {
  transitionScoreToLogo(function () {
    transitionLogoToLogoLuma(callback);
  });
};

const transitionScoreToSponsor = function (callback) {
  transitionScoreToLogo(function () {
    transitionLogoToSponsor(callback);
  });
};

const transitionSponsorToBlank = function (callback) {
  $("#sponsor").transition({ queue: false, opacity: 0 }, 1000, "ease", function () {
    setTimeout(function () {
      $(".blinds.left").removeClass("full");
      $(".blinds.right").show();
      $(".blinds.right").transition({ queue: false, right: "-50%" }, 1000, "ease");
      $(".blinds.left").transition({ queue: false, left: "-50%" }, 1000, "ease", callback);
      $("#sponsor").hide();
    }, 200);
  });
};

const transitionSponsorToBracket = function (callback) {
  transitionSponsorToLogo(function () {
    transitionLogoToBracket(callback);
  });
};

const transitionSponsorToLogo = function (callback) {
  $("#sponsor").transition({ queue: false, opacity: 0 }, 1000, "ease", function () {
    $(".blindsCenter.full").transition({ queue: false, rotateY: "0deg" }, 750, "ease", callback);
    $("#sponsor").hide();
  });
};

const transitionSponsorToScore = function (callback) {
  transitionSponsorToLogo(function () {
    transitionLogoToScore(callback);
  });
};

const transitionTimeoutToBlank = function (callback) {
  $(".timeout-detail").transition({ queue: false, opacity: 0 }, 300, "linear");
  $("#matchTime").transition({ queue: false, opacity: 0 }, 300, "linear", function () {
    $("#timeoutDetails").transition({ queue: false, width: timeoutDetailsIn }, 500, "ease");
    $("#logo").transition({ queue: false, top: logoDown }, 500, "ease", function () {
      $("#overlayCentering").transition(overlayCenteringHideParams, 1000, "ease", callback);
    });
  });
};

const transitionTimeoutToIntro = function (callback) {
  $(".timeout-detail").transition({ queue: false, opacity: 0 }, 300, "linear");
  $("#matchTime").transition({ queue: false, opacity: 0 }, 300, "linear", function () {
    $("#timeoutDetails").transition({ queue: false, width: timeoutDetailsIn }, 500, "ease");
    $("#logo").transition({ queue: false, top: logoDown }, 500, "ease", function () {
      $(".avatars").css("display", "flex");
      $(".avatars").css("opacity", 1);
      $(".teams").css("display", "flex");
      $(".score").transition({ queue: false, width: scoreMid }, 500, "ease", function () {
        $("#eventMatchInfo").show();
        $("#eventMatchInfo").transition({ queue: false, height: eventMatchInfoDown }, 500, "ease", callback);
      });
    });
  });
};

// Loads sponsor slide data and builds the slideshow HTML.
const initializeSponsorDisplay = function () {
  $.getJSON("/api/sponsor_slides", function (slides) {
    $("#sponsorContainer").empty();

    // Inject the HTML for each slide into the DOM.
    $.each(slides, function (index, slide) {
      slide.DisplayTimeMs = slide.DisplayTimeSec * 1000;
      slide.First = index === 0;

      let slideHtml;
      if (slide.Image) {
        slideHtml = sponsorImageTemplate(slide);
      } else {
        slideHtml = sponsorTextTemplate(slide);
      }
      $("#sponsorContainer").append(slideHtml);
    });
  });
};

const getAvatarUrl = function (teamId) {
  return "/api/teams/" + teamId + "/avatar";
};

const setTeamInfo = function (side, position, teamId, cards, rankings) {
  const teamNumberElement = $(`#${side}FinalTeam${position}`);
  teamNumberElement.html(teamId);
  teamNumberElement.toggle(teamId > 0);
  const avatarElement = $(`#${side}FinalTeam${position}Avatar`);
  avatarElement.attr("src", getAvatarUrl(teamId));
  avatarElement.toggle(teamId > 0);

  const cardElement = $(`#${side}FinalTeam${position}Card`);
  cardElement.attr("data-card", cards[teamId.toString()] || "");

  const ranking = rankings[teamId];
  let rankIndicator = "";
  let rankNumber = "";
  if (ranking !== undefined && ranking !== null && ranking.Rank !== 0) {
    rankNumber = ranking.Rank;
    if (rankNumber > ranking.PreviousRank && ranking.PreviousRank > 0) {
      rankIndicator = "rank-down";
    } else if (rankNumber < ranking.PreviousRank) {
      rankIndicator = "rank-up";
    }
  }

  const rankIndicatorElement = $(`#${side}FinalTeam${position}RankIndicator`);
  rankIndicatorElement.attr("src", rankIndicator === "" ? "" : `/static/img/${rankIndicator}.svg`);
  rankIndicatorElement.toggle(rankIndicator !== "" && teamId > 0);

  const rankNumberElement = $(`#${side}FinalTeam${position}RankNumber`);
  rankNumberElement.text(rankNumber);
  rankNumberElement.toggle(teamId > 0);
};


//程式正式開始
$(function () {
  // Read the configuration for this display from the URL query string.
  const urlParams = new URLSearchParams(window.location.search);
  document.body.style.backgroundColor = urlParams.get("background");
  const reversed = urlParams.get("reversed") ?? "true";
  if (reversed === "true") {
    redSide = "left";
    blueSide = "right";
  } else {
    redSide = "right";
    blueSide = "left";
  }
  $("body").attr("data-reversed", reversed);
  $(".reversible-left").attr("data-reversed", reversed);
  $(".reversible-right").attr("data-reversed", reversed);
  const leftAllianceColor = reversed === "true" ? "red" : "blue";
  const rightAllianceColor = reversed === "true" ? "blue" : "red";
  $(".external-score-fields-left .coral-icon")
    .attr("src", `/static/img/${leftAllianceColor}_Fuelgoal.png`);
  $(".external-score-fields-right .coral-icon")
    .attr("src", `/static/img/${rightAllianceColor}_Fuelgoal.png`);
  // This broadcast layout always places the match overlay at the top.
  overlayCenteringHideParams = overlayCenteringTopHideParams;
  overlayCenteringShowParams = overlayCenteringTopShowParams;
  $("#overlayCentering").css({ top: overlayCenteringTopUp, bottom: "auto" });

  // Set up the websocket back to the server.
  websocket = new CheesyWebsocket("/displays/audience/websocket", {
    allianceSelection: function (event) { handleAllianceSelection(event.data); },
    audienceDisplayMode: function (event) { handleAudienceDisplayMode(event.data); },
    lowerThird: function (event) { handleLowerThird(event.data); },
    matchLoad: function (event) { handleMatchLoad(event.data); },
    matchTime: function (event) { handleMatchTime(event.data); },
    matchTiming: function (event) { handleMatchTiming(event.data); },
    playSound: function (event) { handlePlaySound(event.data); },
    realtimeScore: function (event) { handleRealtimeScore(event.data); },
    scorePosted: function (event) { handleScorePosted(event.data); },
  });

  // Map how to transition from one screen to another. Missing links between screens indicate that first we
  // must transition to the blank screen and then to the target screen.
  transitionMap = {
    allianceSelection: {
      blank: transitionAllianceSelectionToBlank,
    },
    blank: {
      allianceSelection: transitionBlankToAllianceSelection,
      bracket: transitionBlankToBracket,
      intro: transitionBlankToIntro,
      logo: transitionBlankToLogo,
      logoLuma: transitionBlankToLogoLuma,
      match: transitionBlankToMatch,
      score: transitionBlankToScore,
      sponsor: transitionBlankToSponsor,
      timeout: transitionBlankToTimeout,
    },
    bracket: {
      blank: transitionBracketToBlank,
      logo: transitionBracketToLogo,
      logoLuma: transitionBracketToLogoLuma,
      score: transitionBracketToScore,
      sponsor: transitionBracketToSponsor,
    },
    intro: {
      blank: transitionIntroToBlank,
      match: transitionIntroToMatch,
      timeout: transitionIntroToTimeout,
    },
    logo: {
      blank: transitionLogoToBlank,
      bracket: transitionLogoToBracket,
      logoLuma: transitionLogoToLogoLuma,
      score: transitionLogoToScore,
      sponsor: transitionLogoToSponsor,
    },
    logoLuma: {
      blank: transitionLogoLumaToBlank,
      bracket: transitionLogoLumaToBracket,
      logo: transitionLogoLumaToLogo,
      score: transitionLogoLumaToScore,
    },
    match: {
      blank: transitionMatchToBlank,
      intro: transitionMatchToIntro,
    },
    score: {
      blank: transitionScoreToBlank,
      bracket: transitionScoreToBracket,
      logo: transitionScoreToLogo,
      logoLuma: transitionScoreToLogoLuma,
      sponsor: transitionScoreToSponsor,
    },
    sponsor: {
      blank: transitionSponsorToBlank,
      bracket: transitionSponsorToBracket,
      logo: transitionSponsorToLogo,
      score: transitionSponsorToScore,
    },
    timeout: {
      blank: transitionTimeoutToBlank,
      intro: transitionTimeoutToIntro,
    },
  }
});
