export const ADMIN_DISCORD_ID = "79237403620945920";
export const ADMIN_ID =
	typeof process !== "undefined" && process.env.NODE_ENV === "test" ? 1 : 274;

//                        Panda  Scep  Acing Baja   Michi
export const STAFF_IDS = [11329, 9719, 9342, 20774, 23094];
//                      hfcRed
export const DEV_IDS = [27883];
//                               hfcRed Dreamy Cafy   Acing
export const QA_IDS: number[] = [27883, 38176, 10654, 9342];
/** Users who can access the scanner while it is not yet enabled for everyone */
export const SCANNER_TESTER_IDS: number[] = [30228];
