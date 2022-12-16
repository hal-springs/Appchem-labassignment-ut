//スプレッドシートに関する定数
const sheet_id = '<sheetid>'; //シートid
const sname_list = '<sheetname1>' //生徒リストのシート名
const sname_vac = '<sheetname2>'; //空き状況のシート名
const name_col = 1; //氏名の列番号-1
const gpa_col = 2; //GPAの列番号-1
const rank_col = 3; //順位の列番号-1
const remark_col=4; //備考の列番号-1
const slack_name_col = 5; //slackusernameの列番号-1
const userid_col = 6; //slackuseridの列番号-1
const typeOfAssign = 7; //配属枠の列番号-1
const assign_col = 8; //配属先の列番号-1
const isAssigned_col = 9; //配属フラグの列番号-1
const waitingResponse = 10; //同順位返信待ちフラグ



//Slack apiに関する定数
const admin_id = '<admin slack id>'; //管理者のSlackid
const token = '<slack user token>'; //Slack apiのUser Access Token


function getUserList(){
  const ss = SpreadsheetApp.openById(sheet_id);
  const sheet = ss.getSheetByName(sname_list);
  const data = sheet.getDataRange().getValues();
  const url = 'https://slack.com/api/users.list'
  const req = {
    method:'get',
    headers:{
        'Content-type':'application/json;charset=utf-8',
        "Authorization": "Bearer " + token
    },
  }
  const result = UrlFetchApp.fetch(url,req);
  
  for(let member of JSON.parse(result.getContentText()).members){
    data.forEach((student,ind)=>{
      if(student[slack_name_col].replace(' ','').replace('　','')==member.profile.real_name.replace(' ','').replace('　','')){
        sheet.getRange(ind+1,userid_col+1).setValue(member.id);
      }
    })
  }
}

function doPost(request) {
  const context = JSON.parse(request.postData.contents); //{user:$str,body:$str}
  //開始・再開用
  if(context.user==admin_id && context.body=='$start'){
    const nextStudents = pickNextStudents(); //[student1,student2,...]

    if(nextStudents.length==0){
      sendDMToSlack([admin_id],'#【管理者通知】次の生徒が見つかりませんでした。')
      return(null);
    }else{
      sendDMToSlack(nextStudents,'#{name}さん\n希望の研究室を"〇〇研究室"の形式で送ってください。\n(例:"植村研究室")\n現在の空き状況は以下のようになっています。\n' + getLabVacancy());
      setWaitingflag(nextStudents)
      return(null);;
    }
  }

  var result = assignStudent(context.user,context.body.replace(' ','')); //{status:$str}

  if(result.status=='ok'){
    sendDMToSlack([context.user],'#研究室配属希望を受け付けました。誤って送信した場合は、研振り担当委員(安藤、門、吉原）まで直ちにご連絡ください。');
    
    const nextStudents = pickNextStudents();
    if(nextStudents.length==0){
      sendDMToSlack(admin_id,'#【管理者通知】次の生徒が見つかりませんでした。')
      return(null);
    }else{
        //sendMessage
        sendDMToSlack(nextStudents,'#{name}さん\n希望の研究室を"〇〇研究室"の形式で送ってください。\n(例:"研究室")\n現在の空き状況は以下のようになっています。\n' + getLabVacancy());
        setWaitingflag(nextStudents);
    }
  }else if(result.status=='no vacancy'){
    sendDMToSlack([context.user],'#その研究室は既に定員に達しています。再度希望を提出してください。');
  }else if(result.status=='no permission'){
    sendDMToSlack([context.user],'#あなたの配属希望提出は受付開始前であるか、既に受け付けられています。')
  }else if(result.status=='syntax error'){
    sendDMToSlack([context.user],'#不正な入力です。')
  }else if(result.status=='confliction'){
    sendDMToSlack([context.user],'#同順位者と配属希望がバッティングしています。研振り委員まで連絡してください。');
    sendDMToSlack([admin_id],'#配属希望のバッティングが発生しました。')
  }else if(result.status=='admin_log'){
    sendDMToSlack([admin_id],'#【管理者通知】次の生徒が見つかりませんでした。')
  }
}

function setWaitingflag(students){
    const ss = SpreadsheetApp.openById(sheet_id);
    const sheet = ss.getSheetByName(sname_list);
    const data = sheet.getDataRange().getValues();
    for(let student of students){
      let ind = data.map(x=>{return(x[name_col])}).indexOf(student[name_col])+1
        sheet.getRange(ind,waitingResponse+1).setValue(1);
    }
}

function getLabVacancy(){
  const ss = SpreadsheetApp.openById(sheet_id);
  const sheet = ss.getSheetByName(sname_vac);
  const data = sheet.getDataRange().getValues();
  data.splice(0,1);
  var res = "";
  //make up vacancy description
  for(let lab of data){
    res += lab[0] + '/' + '定員:' + lab[1] + ' 空き:' + lab[2] + '\n';
  }
  return(res);
}

function assignStudent(user,body){
  var result = {};
  //最初のデータについてエラーキャッチ
  if(pickNextStudents().length==0){
    result.status='admin_log'
    return(result);
  }
  //希望順が回ってきているか>正しい入力か>研究室に空きはあるか
  if(pickNextStudents().map(x=>{return(x[userid_col])}).indexOf(user)==-1){
    result.status='no permission';
    return(result);
  }else{
    const ss = SpreadsheetApp.openById(sheet_id);
    const sheet_lab = ss.getSheetByName(sname_vac);
    const data_lab = sheet_lab.getDataRange().getValues();
    const sheet = ss.getSheetByName(sname_list);
    const data = sheet.getDataRange().getValues();
    const student = data.filter(x=>x[userid_col]==user)[0];
    const labs = data_lab.map(val=>{
      return(val[0]);
    })
    const vacancy = data_lab.map(val=>{
      return(val[2]);
    })
    const temp_assign = data_lab.map(val=>{
      return(val[3]);
    })
    if(labs.indexOf(body)==-1){
      result.status='syntax error';
      return(result);
    }else if(vacancy[labs.indexOf(body)]==0){
      if(temp_assign[labs.indexOf(body)]==1){
        result.status = 'confliction'; //同順位に希望が被った時
      }else{
        result.status='no vacancy';
      }
      return(result);
    }else{
      sheet.getRange(data.indexOf(student)+1,waitingResponse+1).setValue(0);
      let redim_data = sheet.getDataRange().getValues();
      if(redim_data.filter(x=>x[waitingResponse]==1).length>0){
        //同順位の人が残っている時に保留フラグを立てる
        sheet_lab.getRange(labs.indexOf(body)+1,4).setValue(1);
        result.status='await';
      }else{
        data_lab.forEach((val,ind)=>{
          if(ind>0){
            sheet_lab.getRange(ind+1,4).setValue(0);
          }
        })
        result.status='ok';
      }
      sheet.getRange(data.indexOf(student)+1,assign_col+1).setValue(body);
      sheet.getRange(data.indexOf(student)+1,isAssigned_col+1).setValue(1);
      return(result);
    }
  }

}

async function sendDMToSlack(users,body){
  const url = 'https://slack.com/api/chat.postMessage';
  for(let user of users){
    if(Array.isArray(user)){
      var req = {
        method:'post',
        headers:{
            'Content-type':'application/json;charset=utf-8',
            "Authorization": "Bearer " + token
        },
        payload:JSON.stringify({
            channel:user[userid_col],
            text:body.replace('{name}',user[name_col])
        })
      }
    }else{
      var req = {
        method:'post',
        headers:{
            'Content-type':'application/json;charset=utf-8',
            "Authorization": "Bearer " + token
        },
        payload:JSON.stringify({
            channel:user,
            text:body
        })
      }
    }
    UrlFetchApp.fetch(url,req);
    
    //slack apiの負担軽減
    await new Promise((resolve)=>{
      setTimeout(resolve(),100);
    })
  }
}

function pickNextStudents(){
  //getSheet
  const ss = SpreadsheetApp.openById(sheet_id);
  const sheet = ss.getSheetByName(sname_list);
  const data = sheet.getDataRange().getValues();
  data.splice(0,1);
  var data_filtered = data.filter(x=>x[isAssigned_col]!=1 && x[typeOfAssign]==1);
  const ranking = data_filtered.map(val=>{
    return(val[rank_col]);
  })
  const minrank = Math.min(...ranking);
  return(data.filter(x=>x[rank_col]==minrank));
}



function sendRankandGPA(){
  const ss = SpreadsheetApp.openById(sheet_id);
  const sheet = ss.getSheetByName(sname_list);
  const data = sheet.getDataRange().getValues();
  data.splice(0,1);
  const names = data.map(x=>{return(x[name_col])});
  const users = data.map(x=>{return(x[userid_col])});
  const gpas = data.map(x=>{return(x[gpa_col])});
  const ranks = data.map(x=>{return(x[rank_col])});
  const remark = data.map(x=>{return(x[remark_col])})
  const total = data.length;
  const border = Math.floor(total*0.4);
  users.map((user,ind)=>{
    let text = '#' + names[ind] + 'さん\nあなたの全体順位は' + total + '人中' + ranks[ind] + '位で、';
    if(ranks[ind]<=border){
      sheet.getRange(ind+2,typeOfAssign+1).setValue(1);
      text += '第1枠です。\n';
    }else{
      sheet.getRange(ind+2,typeOfAssign+1).setValue(2);
      text += '第2枠です。\n';
    }
    text += '平均GPAは' + gpas[ind] + 'です。\n';
    if(remark[ind] != false){
      text += '(' + remark[ind] + ')';
    }

    sendDMToSlack([user],text);
  })
}

function DMtest(){
  const ss = SpreadsheetApp.openById(sheet_id);
  const sheet = ss.getSheetByName(sname_list);
  const data = sheet.getDataRange().getValues();
  const users = data.map(x=>{return(x[userid_col])});
  const names = data.map(x=>{return(x[1])});
  users.forEach((user,ind)=>{
    var text = '#' + names[ind] + 'さん\nこれはDM配信テストです。\nトラブルの際は研振り委員までご連絡ください。';
    sendDMToSlack([user],text);
  });
}




