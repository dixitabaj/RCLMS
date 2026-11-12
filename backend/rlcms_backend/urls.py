from django.contrib import admin
from django.urls import path
from landcover import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/analysis/", views.analysis),
    path("api/landcover/regions/", views.regions, name="landcover-regions"),
    path("api/landcover/summary/", views.summary, name="landcover-summary"),
    path("api/landcover/trend/", views.trend, name="landcover-trend"),
    path("api/landcover/records/", views.records, name="landcover-records"),
    path("api/landcover/export/", views.export_csv, name="landcover-export"),
    path("api/landcover/provinces/", views.nepal_provinces, name="nepal-provinces"),
]