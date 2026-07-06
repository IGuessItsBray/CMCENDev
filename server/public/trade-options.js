(function () {
  const tradeOptions = [
    "00172-07 - GENERAL OFFICER LIST (BGEN+)",
    "00340 - CELE",
    "00341 - SIGS",
    "00109 - ATIS TECH",
    "00120 - SIGINT SPEC",
    "00381 - CWO",
    "00383 - SIG OP",
    "00384 - LINE TECH",
    "00385 - SIG TECH",
    "00394 - IS TECH",
    "00378 - CYBER OP",
    "00299 - NAV COMM",
    "other"
  ];

  function getTradeOptionLabel(trade) {
    if (trade === "other") {
      return typeof translate === "function"
        ? translate("status_other")
        : "Other";
    }

    return trade;
  }

  function populateTradeSelect(select, selectedValue = "") {
    if (!select) return;

    const currentValue = String(selectedValue || select.value || "").trim();
    const existingValues = new Set(
      Array.from(select.options).map(option => option.value)
    );

    if (!existingValues.has("")) {
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = typeof translate === "function"
        ? translate("select_option")
        : "Select an option";
      select.appendChild(emptyOption);
    }

    tradeOptions.forEach(trade => {
      if (existingValues.has(trade)) return;

      const option = document.createElement("option");
      option.value = trade;
      option.textContent = getTradeOptionLabel(trade);
      select.appendChild(option);
      existingValues.add(trade);
    });

    if (currentValue && !existingValues.has(currentValue)) {
      const legacyOption = document.createElement("option");
      legacyOption.value = currentValue;
      legacyOption.textContent = currentValue;
      select.appendChild(legacyOption);
    }

    select.value = currentValue;
  }

  window.cmcenTradeOptions = tradeOptions;
  window.getCmcenTradeOptionLabel = getTradeOptionLabel;
  window.populateCmcenTradeSelect = populateTradeSelect;
}());
