(async function () {
  console.log("jq server");
  const runfilter = async function (query, data) {
    const ans = await fetch("/jq", {
      method: "POST",
      body: JSON.stringify({
        query,
        data,
      }),
      headers: {
        "Content-Type": "application/json",
        Accpet: "text/plain",
      },
    });
    const re = await ans.json();
    console.log(re);
    return re.response;
  };
  const debounce = function (f, t) {
    let callT = Date.now();
    let tOut = null;
    return function (...args) {
      const now = Date.now();
      clearTimeout(tOut);
      const timediff = now - callT;
      if (timediff >= t) {
        f(...args);
        callT = Date.now();
      } else {
        tOut = setTimeout(function () {
          f(...args);
          callT = Date.now();
        }, t - timediff);
      }
    };
  };
  const jqQueryInput = document.querySelector("#jq-query");
  const jsonInput = document.querySelector("#json");
  const resultDom = document.querySelector("#result");
  const onChange = debounce(async function (ev) {
    const queryVal = jqQueryInput.value;
    const jsonValue = jsonInput.value;
    const result = await runfilter(queryVal, jsonValue);
    // resultDom.textContent = JSON.stringify(result, null, 2);
    resultDom.textContent = result;
  }, 500);
  jqQueryInput.addEventListener("keyup", onChange);
  jqQueryInput.addEventListener("change", onChange);
  jsonInput.addEventListener("change", onChange);
  jsonInput.addEventListener("keyup", onChange);
  /*
    '[{id: .[].id}]'

    [
      {
        "id": "1",
        "name": "n1"
      },
      {
        "id": "2",
        "name": "n1"
      },
      {
        "id": "3",
        "name": "n1"
      }
    ]
  */
})();
