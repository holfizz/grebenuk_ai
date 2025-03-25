class logger {
  log(...props) {
    if (process.env.NODE_ENV === "production") {
      console.log(...props);
    }
  }
  error(...props) {
    if (process.env.NODE_ENV === "production") {
      console.error(...props);
    }
  }
  warn(...props) {
    if (process.env.NODE_ENV === "production") {
      console.warn(...props);
    }
  }
}
export default new logger();
