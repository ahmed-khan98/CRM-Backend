export const extractDomainName = (email) => {
  const domain = email.split("@")[1]; // trademarkusaservice.com
  const nameOnly = domain.split(".")[0]; // trademarkusaservice
  // Pehla letter Capital karne ke liye (Optional):
  return nameOnly.charAt(0).toUpperCase() + nameOnly.slice(1);
};