// Se carga antes de cada archivo de prueba (npm test, con --import).
// Las pruebas NUNCA deben usar claves reales ni la base de datos reales que haya en la terminal o en el .env:
// si las hubiera, llamarían a Groq/DeepSeek de verdad (con costo y lentitud) y cambiarían los resultados.
for(const nombre of ['GROQ_API_KEY','DEEPSEEK_API_KEY','GROQ_MODEL','GROQ_MODEL_RESPALDO','DEEPSEEK_MODEL','GROQ_TIMEOUT_MS','IA_PROVEEDOR_PRIMERO','DATABASE_URL'])delete process.env[nombre];
