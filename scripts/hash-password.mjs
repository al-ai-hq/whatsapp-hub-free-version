import bcrypt from "bcryptjs";
const hash = await bcrypt.hash(process.argv[2], 12);
console.log(hash);
