from django.contrib import admin

from .models import Person


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'birth_date', 'status', 'father', 'mother')
    search_fields = ('first_name',)
