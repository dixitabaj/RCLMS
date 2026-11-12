from rest_framework import serializers

from .models import LandcoverRecord


class LandcoverRecordSerializer(serializers.ModelSerializer):
    """One database row. `filled_missing` is always included so the frontend
    can tell real observations from rows filled with 0 by the collection script."""

    class Meta:
        model = LandcoverRecord
        fields = [
            "id",
            "region_type",
            "region",
            "year",
            "class_name",
            "area_ha",
            "filled_missing",
        ]
