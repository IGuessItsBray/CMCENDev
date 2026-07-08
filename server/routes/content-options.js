const express = require('express');
const {
  ACCOUNT_TRADE_OPTIONS,
  RETIREMENT_TRADE_ROLE_GROUPS,
  RETIREMENT_TRADE_ROLES
} = require('../config/content');

const router = express.Router();

function serializeForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function createTradeOptionsRuntime() {
  const accountTradeOptions = serializeForScript(ACCOUNT_TRADE_OPTIONS);
  const retirementTradeRoleGroups =
    serializeForScript(RETIREMENT_TRADE_ROLE_GROUPS);
  const retirementTradeRoles = serializeForScript(RETIREMENT_TRADE_ROLES);

  return `"use strict";

(function () {
  const tradeOptions = ${accountTradeOptions};
  const retirementTradeRoleGroups = ${retirementTradeRoleGroups};
  const retirementTradeRoles = ${retirementTradeRoles};

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

  function getRetirementTradeRoles(category = "") {
    if (category) {
      return retirementTradeRoleGroups[category] || [];
    }

    return retirementTradeRoles;
  }

  window.CMCENContentOptions = {
    accountTradeOptions: tradeOptions,
    retirementTradeRoleGroups,
    retirementTradeRoles
  };
  window.cmcenTradeOptions = tradeOptions;
  window.cmcenRetirementTradeRoleGroups = retirementTradeRoleGroups;
  window.getCmcenRetirementTradeRoles = getRetirementTradeRoles;
  window.getCmcenTradeOptionLabel = getTradeOptionLabel;
  window.populateCmcenTradeSelect = populateTradeSelect;
}());
`;
}

router.get('/trade-options.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'public, max-age=0, must-revalidate');
  res.send(createTradeOptionsRuntime());
});

router.get('/api/content-options', (req, res) => {
  res.json({
    accountTradeOptions: ACCOUNT_TRADE_OPTIONS,
    retirementTradeRoleGroups: RETIREMENT_TRADE_ROLE_GROUPS,
    retirementTradeRoles: RETIREMENT_TRADE_ROLES
  });
});

module.exports = router;
