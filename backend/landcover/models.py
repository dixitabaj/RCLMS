from django.db import models


class LandcoverRecord(models.Model):
    """
    One number from the RLCMS chart: the area (hectares) of ONE land-cover class
    in ONE region in ONE year.   18 regions x 22 years x 9 classes = 3,564 rows.
    """

    class RegionType(models.TextChoices):
        HKH = "hkh", "Overall HKH"
        ECOREGION = "ecoregion", "Ecoregion"
        HOTSPOT = "hotspot", "Biodiversity hotspot"

    region_type = models.CharField(max_length=20, choices=RegionType.choices)
    region = models.CharField(max_length=120)
    year = models.PositiveSmallIntegerField()
    class_name = models.CharField(max_length=40)
    # FloatField = DOUBLE PRECISION in PostgreSQL (keeps values like 84185046.72 exactly as scraped)
    area_ha = models.FloatField()
    # True = the RLCMS chart had no row for this class, and a 0 was filled in by us.
    # Keep this flag so assumed zeros are never mistaken for measured values.
    filled_missing = models.BooleanField(default=False)

    class Meta:
        db_table = "landcover_records"
        constraints = [
            # Prevents duplicates when the import is run again. PostgreSQL also builds an
            # index on these 4 columns, which speeds up "all classes for region + year".
            models.UniqueConstraint(
                fields=["region_type", "region", "year", "class_name"],
                name="uniq_landcover_region_year_class",
            ),
        ]
        indexes = [
            # speeds up "one class across all years for a region" (the trend line)
            models.Index(fields=["region_type", "region", "class_name"],
                         name="idx_landcover_region_class"),
        ]
        ordering = ["region_type", "region", "class_name", "year"]

    def __str__(self):
        return f"{self.region} | {self.year} | {self.class_name} | {self.area_ha:,.2f} ha"
