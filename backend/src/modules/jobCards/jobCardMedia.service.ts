import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../lib/errors";

export async function addMedia(
  jobCardId: number,
  mediaType: "PHOTO" | "VIDEO",
  angle: string | undefined,
  url: string
) {
  const jobCard = await prisma.jobCard.findUnique({ where: { id: jobCardId } });
  if (!jobCard) throw new NotFoundError("Job card not found");

  return prisma.jobCardMedia.create({
    data: { jobCardId, mediaType, angle, url },
  });
}

export async function removeMedia(jobCardId: number, mediaId: number) {
  const media = await prisma.jobCardMedia.findUnique({ where: { id: mediaId } });
  if (!media || media.jobCardId !== jobCardId) {
    throw new NotFoundError("Media not found on this job card");
  }
  await prisma.jobCardMedia.delete({ where: { id: mediaId } });
}
