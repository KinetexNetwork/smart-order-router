#!/usr/bin/env bash

# Define an array of token addresses
TOKEN_ADDRESSES=(
  "0x2af5d2ad76741191d15dfe7bf6ac92d4bd912ca3"
  "0x54D2252757e1672EEaD234D27B1270728fF90581"
  "0x925206b8a707096ed26ae47c84747fe0bb734f59"
  "0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24"
  "0x3593d125a4f7849a1b059e64f4517a86dd60c95d"
  "0x44ff8620b8ca30902395a7bd3f2407e1a091bf73"
  "0x3073f7aAA4DB83f95e9FFf17424F71D4751a3073"
  "0xf34960d9d60be18cc1d5afc1a6f012a723a28811"
  "0xa35923162c49cf95e6bf26623385eb431ad920d3"
  "0xcb1592591996765ec0efc1f92599a19767ee5ffa"
  "0xac57de9c1a09fec648e93eb98875b212db0d460b"
  "0x9Ce84F6A69986a83d92C324df10bC8E64771030f"
  "0xf8173a39c56a554837c4c7f104153a005d284d11"
  "0x7ff7fa94b8b66ef313f7970d4eebd2cb3103a2c0"
)


# Loop through each token address and run the command
for TOKEN in "${TOKEN_ADDRESSES[@]}"; do
  echo "Processing token: $TOKEN"
  ./bin/cli generate --tokenOut "$TOKEN" --chainId 1
done
