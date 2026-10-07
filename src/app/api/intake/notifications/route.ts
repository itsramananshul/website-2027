import { NextResponse } from "next/server";
import { requireCron, apiError } from "@/lib/intake/http";
import { deliverNotifications, expireOffers } from "@/lib/intake/notifications";
export async function GET(request: Request) {
  try {
    requireCron(request);
    await expireOffers();
    return NextResponse.json(await deliverNotifications());
  } catch (error) {
    return apiError(error);
  }
}
