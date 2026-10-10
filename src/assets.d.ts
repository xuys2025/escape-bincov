/** esbuild inlines imported PNGs as data URLs (scripts/build.mjs); nothing is fetched at runtime. */
declare module '*.png' {
    const url: string;
    export default url;
}
/** Stylesheets imported from code are inlined as text (the station yard puts its CSS in a shadow root). */
declare module '*.css' {
    const text: string;
    export default text;
}
