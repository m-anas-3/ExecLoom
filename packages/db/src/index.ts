export type DatabaseHealth = {
  status: "not_connected";
};

export function getDatabaseHealth(): DatabaseHealth {
  return { status: "not_connected" };
}
