import { generateMnemonic, english, mnemonicToAccount } from 'viem/accounts'

const mnemonic = generateMnemonic(english)
const account = mnemonicToAccount(mnemonic)
console.log(JSON.stringify({ mnemonic, address: account.address }))
