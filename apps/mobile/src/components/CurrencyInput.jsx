import { useState } from "react";
import { AppInput } from "./AppInput";
import { formatCurrencyInput, normalizeCurrencyInput } from "../utils/currency-input";

export function CurrencyInput({ onChangeText, value = "", ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <AppInput
      {...props}
      keyboardType="decimal-pad"
      onBlur={() => {
        setFocused(false);
        onChangeText(formatCurrencyInput(value));
      }}
      onChangeText={(text) => onChangeText(normalizeCurrencyInput(text))}
      onFocus={() => setFocused(true)}
      placeholder="0,00"
      prefix="R$"
      value={focused ? normalizeCurrencyInput(value) : formatCurrencyInput(value)}
    />
  );
}
